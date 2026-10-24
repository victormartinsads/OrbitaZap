import * as cheerio from "cheerio";
import { logger } from "@/lib/logger";

export interface EnrichedSiteData {
    emails: string[];
    instagram: string | null;
    facebook: string | null;
    linkedin: string | null;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IG_REGEX = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9._]+)/i;
const FB_REGEX = /(?:https?:\/\/)?(?:www\.)?facebook\.com\/([a-zA-Z0-9._-]+)/i;
const LI_REGEX = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:company|in)\/([a-zA-Z0-9._-]+)/i;

// Ignora extensões de imagem e arquivos que podem parecer e-mail
const IGNORED_EMAIL_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".css", ".js", "wixpress.com", "sentry.io"];

/**
 * Acessa o site da empresa (Home e opcionalmente /contato)
 * e extrai e-mails e redes sociais (Instagram, Facebook, LinkedIn).
 */
export async function enrichFromWebsite(rawUrl: string | null | undefined): Promise<EnrichedSiteData> {
    const result: EnrichedSiteData = {
        emails: [],
        instagram: null,
        facebook: null,
        linkedin: null,
    };

    if (!rawUrl || !rawUrl.trim()) return result;

    let targetUrl = rawUrl.trim();
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        targetUrl = `https://${targetUrl}`;
    }

    const emailsFound = new Set<string>();

    const fetchPage = async (url: string): Promise<string | null> => {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000); // 6s de timeout para não travar

            const res = await fetch(url, {
                signal: controller.signal,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                },
            });
            clearTimeout(timeout);

            if (!res.ok) return null;
            return await res.text();
        } catch {
            return null;
        }
    };

    // 1. Raspa a Home
    const homeHtml = await fetchPage(targetUrl);
    if (!homeHtml) return result;

    const parseHtml = (html: string) => {
        const $ = cheerio.load(html);

        // 1. Extração de E-mails nos textos e mailto:
        $('a[href^="mailto:"]').each((_, el) => {
            const href = $(el).attr("href") || "";
            const email = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
            if (email && email.includes("@")) emailsFound.add(email);
        });

        const textMatches = html.match(EMAIL_REGEX) || [];
        for (const m of textMatches) {
            const clean = m.trim().toLowerCase();
            if (!IGNORED_EMAIL_EXTS.some(ext => clean.endsWith(ext) || clean.includes(ext))) {
                emailsFound.add(clean);
            }
        }

        // 2. Extração de Redes Sociais nos links <a>
        $("a[href]").each((_, el) => {
            const href = $(el).attr("href") || "";

            if (!result.instagram && IG_REGEX.test(href)) {
                // Filtra links internos ou genéricos do Instagram
                if (!href.includes("/p/") && !href.includes("/reel/") && !href.includes("/explore/")) {
                    result.instagram = href.startsWith("http") ? href : `https://${href}`;
                }
            }

            if (!result.facebook && FB_REGEX.test(href)) {
                if (!href.includes("/sharer") && !href.includes("/share.php")) {
                    result.facebook = href.startsWith("http") ? href : `https://${href}`;
                }
            }

            if (!result.linkedin && LI_REGEX.test(href)) {
                result.linkedin = href.startsWith("http") ? href : `https://${href}`;
            }
        });
    };

    parseHtml(homeHtml);

    // 2. Se não achou e-mail na Home, tenta a página /contato
    if (emailsFound.size === 0) {
        try {
            const parsed = new URL(targetUrl);
            const contactUrl = `${parsed.origin}/contato`;
            const contactHtml = await fetchPage(contactUrl);
            if (contactHtml) parseHtml(contactHtml);
        } catch {}
    }

    result.emails = Array.from(emailsFound).slice(0, 3);
    return result;
}
