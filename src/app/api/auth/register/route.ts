import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { trialEndDate } from "@/lib/billing/access";
import { clientIp, hit, HOUR } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/account";

const registerSchema = z.object({
    name: z.string().trim().min(2),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8),
});

export async function POST(req: Request) {
    try {
        if (!hit(`register:ip:${clientIp(req.headers)}`, 5, HOUR).allowed) {
            return NextResponse.json({ error: "Muitos cadastros a partir desta rede. Tente de novo mais tarde." }, { status: 429 });
        }

        const body = await req.json();
        const { email, password, name } = registerSchema.parse(body);

        const systemConfig = await prisma.systemConfig.findUnique({ where: { id: "default" } });
        if (systemConfig && systemConfig.enableRegistration === false) {
            return NextResponse.json({ error: "O cadastro está desativado pelo administrador." }, { status: 403 });
        }

        const existingUser = await prisma.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
        });
        if (existingUser) {
            return NextResponse.json({ error: "Já existe uma conta com este e-mail." }, { status: 400 });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                subscription: {
                    create: { planId: "starter", status: "TRIALING", trialEndsAt: trialEndDate() },
                },
            },
        });

        // A falha no envio não impede o cadastro: o usuário pode reenviar pelo painel.
        await sendVerificationEmail(newUser).catch(e => console.error("Verification email error:", e));

        return NextResponse.json({
            success: true,
            message: "User registered successfully",
            user: { id: newUser.id, name: newUser.name, email: newUser.email },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: "Dados inválidos. A senha precisa ter pelo menos 8 caracteres." },
                { status: 400 }
            );
        }

        console.error("Registration error:", error);
        return NextResponse.json({ error: "Erro interno ao criar a conta." }, { status: 500 });
    }
}
