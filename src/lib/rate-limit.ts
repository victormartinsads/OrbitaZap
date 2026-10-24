// Janela deslizante em memória. O app roda num único processo; em várias instâncias isto precisaria ir para o banco/Redis.
const globalForRateLimit = globalThis as unknown as { rateLimitHits?: Map<string, number[]> };
const hits = (globalForRateLimit.rateLimitHits ??= new Map<string, number[]>());

export function hit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs);
    if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, retryAfterSec: Math.ceil((recent[0] + windowMs - now) / 1000) };
    }
    recent.push(now);
    hits.set(key, recent);
    return { allowed: true, retryAfterSec: 0 };
}

/** Só consulta, sem registrar tentativa. */
export function isLimited(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    return (hits.get(key) ?? []).filter(t => now - t < windowMs).length >= limit;
}

export function reset(key: string) {
    hits.delete(key);
}

export function clientIp(headers: Headers) {
    return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
