import { logger } from "@/lib/logger";

/** Empresa encontrada no Google Maps ou OpenStreetMap. */
export interface MapsPlace {
    placeId: string;
    name: string;
    phone: string | null; // só dígitos com DDI, ex.: 5511987654321
    rawPhone: string | null;
    isMobile: boolean;    // celular BR (mais chance de ter WhatsApp)
    address: string | null;
    category: string | null;
    rating: number | null;
    reviews: number | null;
    website: string | null;
    mapsUrl: string | null;
}

const FIELDS = [
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.websiteUri",
    "places.rating",
    "places.userRatingCount",
    "places.googleMapsUri",
    "places.primaryTypeDisplayName",
    "places.businessStatus",
    "nextPageToken",
].join(",");

/**
 * Normaliza telefone para dígitos com DDI. Sem DDI, assume Brasil (55).
 * Retorna null se não parecer um telefone válido.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry = "55"): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    let digits = trimmed.replace(/\D/g, "");
    if (!digits) return null;
    if (trimmed.startsWith("+")) {
        // já tem DDI
    } else if (digits.startsWith("00")) {
        digits = digits.slice(2);
    } else if (digits.startsWith("0")) {
        digits = defaultCountry + digits.replace(/^0+/, "");
    } else if (!(digits.startsWith(defaultCountry) && digits.length >= 12)) {
        digits = defaultCountry + digits;
    }
    if (digits.length < 10 || digits.length > 15) return null;
    return digits;
}

/** Celular brasileiro: 55 + DDD + 9XXXXXXXX. */
export function isBrMobile(phone: string | null): boolean {
    return !!phone && /^55\d{2}9\d{8}$/.test(phone);
}

/**
 * Busca gratuita e aberta via OpenStreetMap Nominatim + Overpass API.
 * Funciona sem nenhuma chave de API configurada!
 */
export async function searchOpenWebPlaces(opts: { query: string; niche?: string; city?: string; maxResults?: number }): Promise<MapsPlace[]> {
    const max = Math.min(Math.max(opts.maxResults || 40, 1), 60);
    const out: MapsPlace[] = [];

    try {
        const query = encodeURIComponent(opts.query);
        const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&addressdetails=1&extratags=1&namedetails=1&limit=${max}`;

        const res = await fetch(url, {
            headers: {
                "User-Agent": "MarcFlow-Prospeccao/1.0 (contato@marcflow.local)",
                "Accept-Language": "pt-BR,pt;q=0.9",
            },
        });

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                for (const item of data) {
                    const extra = item.extratags || {};
                    const rawPhone = extra.phone || extra["contact:phone"] || extra["contact:mobile"] || null;
                    const phone = normalizePhone(rawPhone);
                    const website = extra.website || extra["contact:website"] || extra.url || null;

                    out.push({
                        placeId: String(item.place_id || item.osm_id || Math.random().toString(36).slice(2)),
                        name: item.namedetails?.name || item.name || item.display_name?.split(",")[0] || "Empresa Local",
                        phone,
                        rawPhone,
                        isMobile: isBrMobile(phone),
                        address: item.display_name || null,
                        category: extra.cuisine || extra.shop || extra.amenity || extra.craft || opts.niche || "Comércio local",
                        rating: null,
                        reviews: null,
                        website,
                        mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.display_name || item.name)}`,
                    });
                }
            }
        }
    } catch (err) {
        logger.warn("Prospect", "Erro na busca pública alternativa", err);
    }

    return out;
}

/**
 * Busca principal: se tiver chave do Google Maps, usa Places API (New) com dados completos.
 * Se NÃO tiver chave, faz busca pública aberta sem travar o usuário!
 */
export async function searchPlaces(opts: { apiKey?: string | null; query: string; niche?: string; city?: string; maxResults?: number }): Promise<MapsPlace[]> {
    const max = Math.min(Math.max(opts.maxResults || 60, 1), 60);

    // Se NÃO tiver chave de API do Google Maps, usa a busca aberta sem travar
    if (!opts.apiKey || !opts.apiKey.trim()) {
        logger.info("Prospect", `Buscando sem chave de API Google Maps para: "${opts.query}"`);
        return await searchOpenWebPlaces({
            query: opts.query,
            niche: opts.niche,
            city: opts.city,
            maxResults: max,
        });
    }

    // Se tiver chave de API do Google Maps, usa a Places API oficial
    const out: MapsPlace[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < 3 && out.length < max; page++) {
        const body: Record<string, unknown> = { textQuery: opts.query, languageCode: "pt-BR", regionCode: "BR", pageSize: 20 };
        if (pageToken) body.pageToken = pageToken;

        const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": opts.apiKey,
                "X-Goog-FieldMask": FIELDS,
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.text();
            logger.error("Prospect", `Places API ${res.status}: ${err}. Recorrendo à busca aberta...`);
            // Se a chave falhar (ex: sem saldo ou inválida), faz fallback para a busca pública
            return await searchOpenWebPlaces({
                query: opts.query,
                niche: opts.niche,
                city: opts.city,
                maxResults: max,
            });
        }

        const data = await res.json() as { places?: any[]; nextPageToken?: string };
        for (const p of data.places || []) {
            if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
            const rawPhone = p.internationalPhoneNumber || p.nationalPhoneNumber || null;
            const phone = normalizePhone(rawPhone);
            out.push({
                placeId: p.id,
                name: p.displayName?.text || "Sem nome",
                phone,
                rawPhone,
                isMobile: isBrMobile(phone),
                address: p.formattedAddress || null,
                category: p.primaryTypeDisplayName?.text || null,
                rating: typeof p.rating === "number" ? p.rating : null,
                reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
                website: p.websiteUri || null,
                mapsUrl: p.googleMapsUri || null,
            });
        }
        pageToken = data.nextPageToken;
        if (!pageToken) break;
        await new Promise(r => setTimeout(r, 1500));
    }

    return out.slice(0, max);
}
