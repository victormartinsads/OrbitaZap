import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { text } = body;

        if (!text || !text.trim()) {
            return NextResponse.json({ error: "Mensagem não pode ser vazia" }, { status: 400 });
        }

        const lead = await prisma.prospectLead.findFirst({
            where: { id, userId: session.user.id },
        });

        if (!lead) {
            return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
        }

        const config = await prisma.prospectConfig.findUnique({
            where: { userId: session.user.id },
            select: { sessionId: true },
        });

        if (!config?.sessionId) {
            return NextResponse.json({ error: "Nenhuma sessão do WhatsApp configurada" }, { status: 400 });
        }

        const { waManager } = await import("@/modules/whatsapp/manager");
        const inst = waManager.getInstance(config.sessionId);
        if (!inst?.socket || inst.status !== "CONNECTED") {
            return NextResponse.json({ error: "Sessão do WhatsApp desconectada" }, { status: 400 });
        }

        const targetJid = lead.jid || `${lead.phone}@s.whatsapp.net`;
        const sent = await inst.socket.sendMessage(targetJid, { text: text.trim() });
        const keyId = sent?.key?.id || `MAN_${Date.now()}`;

        const msg = await prisma.prospectMessage.create({
            data: {
                leadId: lead.id,
                fromMe: true,
                byAI: false,
                content: text.trim(),
                keyId,
            },
        });

        // Como um operador humano respondeu, pausa a IA do lead
        await prisma.prospectLead.update({
            where: { id: lead.id },
            data: {
                aiPaused: true,
                lastOutboundAt: new Date(),
                status: lead.status === "CONTACTED" ? "CONVERSING" : lead.status,
            },
        });

        return NextResponse.json({ success: true, message: msg });
    } catch (error) {
        return apiError(error);
    }
}
