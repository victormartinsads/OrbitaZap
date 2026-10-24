import { createHash, randomBytes } from "crypto";
import type { AuthTokenType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Cria um token de uso único. Só o hash vai para o banco; o token puro segue no link do e-mail. */
export async function createAuthToken(userId: string, type: AuthTokenType, ttlMs: number) {
    const token = randomBytes(32).toString("base64url");
    await prisma.$transaction([
        prisma.authToken.deleteMany({ where: { userId, type } }),
        prisma.authToken.create({
            data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
        }),
    ]);
    return token;
}

/** Valida e queima o token. Devolve o userId ou null se for inválido, vencido ou já usado. */
export async function consumeAuthToken(token: string, type: AuthTokenType) {
    const record = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) return null;

    const { count } = await prisma.authToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
    });
    return count === 1 ? record.userId : null;
}
