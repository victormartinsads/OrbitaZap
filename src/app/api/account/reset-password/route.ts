import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";
import { consumeAuthToken } from "@/lib/tokens";
import { clientIp, hit, HOUR } from "@/lib/rate-limit";

const schema = z.object({
    token: z.string().min(20),
    password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres"),
});

export async function POST(req: Request) {
    try {
        if (!hit(`reset:ip:${clientIp(req.headers)}`, 20, HOUR).allowed) {
            return NextResponse.json({ error: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
        }

        const parsed = schema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
        }

        const userId = await consumeAuthToken(parsed.data.token, "PASSWORD_RESET");
        if (!userId) {
            return NextResponse.json({ error: "Este link é inválido ou expirou. Peça um novo." }, { status: 400 });
        }

        const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
        await prisma.user.update({
            where: { id: userId },
            data: {
                password: await bcrypt.hash(parsed.data.password, 10),
                // Quem abriu o link provou que o e-mail é dele.
                ...(!user?.emailVerifiedAt && { emailVerifiedAt: new Date() }),
            },
        });
        await prisma.authToken.deleteMany({ where: { userId, type: "PASSWORD_RESET" } });

        return NextResponse.json({ success: true });
    } catch (error) {
        return apiError(error);
    }
}
