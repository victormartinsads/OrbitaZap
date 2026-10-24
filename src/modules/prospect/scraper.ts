import puppeteer, { Browser } from "puppeteer-core";
import { logger } from "@/lib/logger";
import { normalizePhone, isBrMobile } from "./maps";
import { enrichFromWebsite } from "./enricher";

export interface ScrapedLead {
    placeId: string;
    name: string;
    phone: string | null;
    rawPhone: string | null;
    isMobile: boolean;
    address: string | null;
    category: string | null;
    rating: number | null;
    reviews: number | null;
    website: string | null;
    mapsUrl: string | null;
    // Campos enriquecidos
    email: string | null;
    instagram: string | null;
    facebook: string | null;
    linkedin: string | null;
}

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/**
 * Remove acentos e caracteres especiais para comparação flexível
 */
function cleanText(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .trim();
}

/**
 * Verifica se um endereço corresponde à cidade/bairro informado.
 * Ex: Se usuário buscou "São Paulo", aceita "São Paulo", "SP", etc.
 * Se buscou "Campinas SP", testa palavras-chave principais.
 */
function matchesLocation(address: string | null, requestedCity: string): boolean {
    if (!address || !requestedCity) return true;

    const normAddr = cleanText(address);
    const normCity = cleanText(requestedCity);

    // Se o endereço contém a string completa da cidade
    if (normAddr.includes(normCity)) return true;

    // Se a busca tiver palavras-chave (ex: "moema sao paulo", "campinas sp")
    const words = normCity.split(/\s+/).filter((w) => w.length > 2);
    if (words.length > 0) {
        // Pelo menos a palavra mais relevante (ex: cidade ou bairro) deve estar presente
        const hasMainWord = words.some((w) => normAddr.includes(w));
        if (hasMainWord) return true;
    }

    return false;
}

/**
 * Scraper nativo do Google Maps via Microsoft Edge headless.
 * 1. Abre a busca oficial do Google Maps.
 * 2. Faz scroll no feed para carregar estabelecimentos reais.
 * 3. Extrai diretamente dados da listagem e abre cards de detalhes quando necessário.
 * 4. Valida se o local bate com a cidade/bairro pesquisado.
 * 5. Varre o site da empresa buscando Instagram, Facebook e E-mail.
 */
export async function scrapeGoogleMaps(opts: {
    query: string;
    cityFilter?: string;
    maxResults?: number;
    enrichSites?: boolean;
}): Promise<ScrapedLead[]> {
    const max = Math.min(Math.max(opts.maxResults || 25, 5), 80);
    const enrich = opts.enrichSites ?? true;
    const cityFilter = (opts.cityFilter || "").trim();

    logger.info("Scraper", `Iniciando extração Google Maps via Edge para: "${opts.query}" (Meta: ${max} leads)...`);

    let browser: Browser | null = null;
    const leads: ScrapedLead[] = [];

    try {
        browser = await puppeteer.launch({
            executablePath: EDGE_PATH,
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu",
                "--lang=pt-BR,pt",
            ],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 768 });

        // URL de busca direta no Google Maps em pt-BR
        const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(opts.query)}?hl=pt-BR`;
        await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 35000 });

        // Aguarda o carregamento inicial dos resultados
        await page.waitForSelector('div[role="feed"]', { timeout: 12000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 2500));

        // Scroll no feed para carregar mais estabelecimentos reais
        let prevCount = 0;
        let attempts = 0;

        for (let scrollStep = 0; scrollStep < 8; scrollStep++) {
            const currentCount = await page.evaluate(() => {
                return document.querySelectorAll('a[href*="/maps/place/"]').length;
            });

            if (currentCount >= max + 8) break;

            await page.evaluate(() => {
                const feed = document.querySelector('div[role="feed"]');
                if (feed) {
                    feed.scrollTop = feed.scrollHeight;
                } else {
                    window.scrollBy(0, 1500);
                }
            });

            await new Promise((r) => setTimeout(r, 1600));

            if (currentCount === prevCount) {
                attempts++;
                if (attempts >= 3) break;
            } else {
                attempts = 0;
                prevCount = currentCount;
            }
        }

        // Coleta todos os links únicos dos estabelecimentos
        const placeLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
            const map = new Map<string, string>();

            for (const link of links) {
                const href = (link as HTMLAnchorElement).href;
                const name = link.getAttribute("aria-label")?.trim();
                if (href && name && !map.has(href)) {
                    map.set(href, name);
                }
            }

            return Array.from(map.entries()).map(([href, name]) => ({ href, name }));
        });

        logger.info("Scraper", `Google Maps retornou ${placeLinks.length} estabelecimentos reais. Extraindo detalhes...`);

        // Abre cada ficha para extrair telefone, site, endereço e nota oficiais
        const detailPage = await browser.newPage();
        await detailPage.setViewport({ width: 1280, height: 720 });

        for (const item of placeLinks) {
            if (leads.length >= max) break;

            try {
                await detailPage.goto(item.href, { waitUntil: "domcontentloaded", timeout: 18000 });
                await new Promise((r) => setTimeout(r, 1400));

                const data = await detailPage.evaluate(() => {
                    const title = document.querySelector("h1")?.textContent?.trim() || "";
                    const address = document.querySelector('[data-item-id="address"]')?.getAttribute("aria-label")?.replace("Endereço: ", "").trim() || null;
                    const phone = document.querySelector('[data-item-id*="phone:"]')?.getAttribute("aria-label")?.replace("Telefone: ", "").trim() || null;
                    const website = document.querySelector('[data-item-id="authority"]')?.getAttribute("href") || null;
                    const category = document.querySelector('button[jsaction*="category"]')?.textContent?.trim() || null;

                    // Avaliação e reviews
                    let rating: number | null = null;
                    let reviews: number | null = null;
                    const ratingRaw = document.querySelector("div.F7nice")?.textContent?.trim() || "";
                    if (ratingRaw) {
                        const m = ratingRaw.match(/(\d[.,]\d)/);
                        if (m) rating = parseFloat(m[1].replace(",", "."));
                        const revMatch = ratingRaw.match(/\((\d+[\d.,]*)\)/);
                        if (revMatch) reviews = parseInt(revMatch[1].replace(/\D/g, ""), 10);
                    }

                    return { title: title || null, address, phone, website, category, rating, reviews };
                });

                // Validação de Localização: garante que a empresa é da cidade/bairro solicitado
                if (cityFilter && data.address) {
                    if (!matchesLocation(data.address, cityFilter)) {
                        logger.debug("Scraper", `Descartado lead fora de ${cityFilter}: "${data.address}"`);
                        continue;
                    }
                }

                const finalName = data.title || item.name;
                const normalized = normalizePhone(data.phone);

                leads.push({
                    placeId: Buffer.from(item.href).toString("base64").slice(0, 32),
                    name: finalName,
                    phone: normalized,
                    rawPhone: data.phone,
                    isMobile: isBrMobile(normalized),
                    address: data.address,
                    category: data.category,
                    rating: data.rating,
                    reviews: data.reviews,
                    website: data.website,
                    mapsUrl: item.href,
                    email: null,
                    instagram: null,
                    facebook: null,
                    linkedin: null,
                });
            } catch (cardErr) {
                logger.warn("Scraper", `Falha ao extrair card de ${item.name}`, cardErr);
            }
        }

        await detailPage.close().catch(() => null);
    } catch (err) {
        logger.error("Scraper", "Erro na execução do navegador", err);
    } finally {
        if (browser) {
            await browser.close().catch(() => null);
        }
    }

    // Etapa 2: Enriquecimento via Web Crawler no site oficial da empresa (se tiver site)
    if (enrich && leads.length > 0) {
        const withSite = leads.filter((l) => l.website);
        if (withSite.length > 0) {
            logger.info("Scraper", `Enriquecendo dados via sites para ${withSite.length} empresas...`);

            for (const lead of withSite) {
                if (lead.website) {
                    try {
                        const enriched = await enrichFromWebsite(lead.website);
                        lead.email = enriched.emails[0] || null;
                        lead.instagram = enriched.instagram;
                        lead.facebook = enriched.facebook;
                        lead.linkedin = enriched.linkedin;
                    } catch {
                        // Ignora falhas de timeout em sites lentos
                    }
                }
            }
        }
    }

    logger.success("Scraper", `Extração concluída com sucesso! Total de ${leads.length} estabelecimentos reais.`);
    return leads;
}
