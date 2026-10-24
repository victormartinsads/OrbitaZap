import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";
import { canAccessSession } from "@/lib/api-auth";

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        let config = await prisma.prospectConfig.findUnique({
            where: { userId: session.user.id },
        });

        if (!config) {
            // Cria configuração inicial padrão para o usuário
            config = await prisma.prospectConfig.create({
                data: {
                    userId: session.user.id,
                    persona: "Marcos, da agência",
                    offerText: `Oferecemos criação de sites profissionais, responsivos e rápidos.
- Landing Page de alta conversão: ideal para divulgar um produto/serviço no WhatsApp ou tráfego pago.
- Site Institucional: apresentação completa da empresa, catálogo/serviços, depoimentos e botão WhatsApp.
- Loja Virtual / Catálogo Online: pedidos direto no WhatsApp ou com checkout integrado.
- Prazos: entre 3 e 7 dias úteis.
- Valores sob medida com pagamento facilitado.
- Hospedagem e suporte inclusos no primeiro ano.`,
                    extraRules: "Seja educado e direto. Nunca insista se a pessoa disser que não tem interesse.",
                    dailyLimit: 40,
                    minDelaySec: 90,
                    maxDelaySec: 240,
                    workStart: 9,
                    workEnd: 18,
                    aiEnabled: true,
                },
            });
        }

        return NextResponse.json({ config });
    } catch (error) {
        return apiError(error);
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const body = await req.json();
        const {
            sessionId,
            persona,
            offerText,
            extraRules,
            geminiApiKey,
            geminiModel,
            mapsApiKey,
            dailyLimit,
            minDelaySec,
            maxDelaySec,
            workStart,
            workEnd,
            aiEnabled,
            notifyPhone,
        } = body;

        if (sessionId && !(await canAccessSession(session.user.id, session.user.role as string, sessionId))) {
            return NextResponse.json({ error: "Você não tem acesso a esse WhatsApp" }, { status: 403 });
        }

        const updated = await prisma.prospectConfig.upsert({
            where: { userId: session.user.id },
            create: {
                userId: session.user.id,
                sessionId: sessionId || null,
                persona: persona || "Marcos, da agência",
                offerText: offerText || "",
                extraRules: extraRules || "",
                geminiApiKey: geminiApiKey || null,
                geminiModel: geminiModel || "gemini-flash-latest",
                mapsApiKey: mapsApiKey || null,
                dailyLimit: Number(dailyLimit) || 40,
                minDelaySec: Number(minDelaySec) || 90,
                maxDelaySec: Number(maxDelaySec) || 240,
                workStart: Number(workStart) ?? 9,
                workEnd: Number(workEnd) ?? 18,
                aiEnabled: aiEnabled ?? true,
                notifyPhone: notifyPhone || null,
            },
            update: {
                sessionId: sessionId !== undefined ? sessionId || null : undefined,
                persona: persona !== undefined ? persona : undefined,
                offerText: offerText !== undefined ? offerText : undefined,
                extraRules: extraRules !== undefined ? extraRules : undefined,
                geminiApiKey: geminiApiKey !== undefined ? geminiApiKey || null : undefined,
                geminiModel: geminiModel !== undefined ? geminiModel : undefined,
                mapsApiKey: mapsApiKey !== undefined ? mapsApiKey || null : undefined,
                dailyLimit: dailyLimit !== undefined ? Number(dailyLimit) : undefined,
                minDelaySec: minDelaySec !== undefined ? Number(minDelaySec) : undefined,
                maxDelaySec: maxDelaySec !== undefined ? Number(maxDelaySec) : undefined,
                workStart: workStart !== undefined ? Number(workStart) : undefined,
                workEnd: workEnd !== undefined ? Number(workEnd) : undefined,
                aiEnabled: aiEnabled !== undefined ? Boolean(aiEnabled) : undefined,
                notifyPhone: notifyPhone !== undefined ? notifyPhone || null : undefined,
            },
        });

        return NextResponse.json({ success: true, config: updated });
    } catch (error) {
        return apiError(error);
    }
}
