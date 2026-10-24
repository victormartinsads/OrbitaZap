import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { clientIp, hit, HOUR } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/account";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });
const GENERIC = { message: "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha." };

export async function POST(req: Request) {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Informe um e-mail válido" }, { status: 400 });
    const { email } = parsed.data;

    if (!hit(`forgot:ip:${clientIp(req.headers)}`, 10, HOUR).allowed) {
        return NextResponse.json({ error: "Muitos pedidos. Tente de novo mais tarde." }, { status: 429 });
    }
    // Same answer whether the account exists or not, and whether this e-mail hit its limit.
    if (!hit(`forgot:email:${email}`, 3, HOUR).allowed) return NextResponse.json(GENERIC);

    try {
        const user = await prisma.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
            select: { id: true, name: true, email: true },
        });
        if (user) await sendPasswordResetEmail(user);
    } catch (error) {
        console.error("Forgot password error:", error);
    }
    return NextResponse.json(GENERIC);
}
