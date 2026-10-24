import type { WASocket } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { renderProspectMessage } from "@/modules/prospect/runner";

/**
 * Envia a mensagem de primeiro contato para um lead do CRM e registra no histórico/atividades.
 */
export async function sendFirstContactToLead(userId: string, crmLeadId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const lead = await prisma.crmLead.findFirst({
            where: { id: crmLeadId, userId },
        });

        if (!lead) return { success: false, error: "Lead não encontrado" };
        if (!lead.phone) return { success: false, error: "Lead não possui telefone cadastrado" };

        const config = await prisma.prospectConfig.findUnique({
            where: { userId },
        });

        const sessionId = config?.sessionId;
        if (!sessionId) {
            return { success: false, error: "Nenhuma sessão do WhatsApp vinculada para disparos. Configure em Prospecção → Configurações." };
        }

        const { waManager } = await import("@/modules/whatsapp/manager");
        const inst = waManager.getInstance(sessionId);
        if (!inst?.socket || inst.status !== "CONNECTED") {
            return { success: false, error: "Sessão do WhatsApp desconectada." };
        }

        const sock = inst.socket as WASocket;
        const cleanPhone = lead.phone.replace(/\D/g, "");
        const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

        // Valida se o número tem WhatsApp ativo
        let targetJid: string | null = null;
        try {
            const results = await sock.onWhatsApp(formattedPhone);
            const match = results?.find(r => r.exists);
            if (match?.jid) targetJid = match.jid;
        } catch {
            targetJid = `${formattedPhone}@s.whatsapp.net`;
        }

        if (!targetJid) {
            return { success: false, error: "Número não cadastrado no WhatsApp." };
        }

        // Pega a mensagem de abertura da última campanha ou usa o template padrão
        const lastCampaign = await prisma.prospectCampaign.findFirst({
            where: { userId },
            orderBy: { createdAt: "desc" },
            select: { openingMessage: true },
        });

        const template = lastCampaign?.openingMessage ||
            `{Oi|Olá}, {primeiro_nome}! Tudo bem?\nVi a {nome} no Google e achei muito bacana o trabalho de vocês em {cidade}.\n\nNotei que vocês ainda não possuem um site próprio para divulgar os serviços. Já pensaram em criar um para atrair mais clientes?`;

        const textToSend = renderProspectMessage(template, {
            name: lead.name,
            city: (lead.customFields as any)?.city || lead.company,
            category: (lead.customFields as any)?.category,
            address: (lead.customFields as any)?.address,
        });

        // Simula digitação humanizada
        try {
            await sock.sendPresenceUpdate("composing", targetJid);
            const delay = Math.min(3500, Math.max(1200, textToSend.length * 20));
            await new Promise(r => setTimeout(r, delay));
            await sock.sendPresenceUpdate("paused", targetJid);
        } catch {}

        const sent = await sock.sendMessage(targetJid, { text: textToSend });
        const keyId = sent?.key?.id || `CRM_FIRST_${Date.now()}`;

        // 1. Cria ou sincroniza na tabela ProspectLead para que a IA (Gemini) monitore a resposta automaticamente
        const prospectLead = await prisma.prospectLead.upsert({
            where: {
                userId_phone: {
                    userId,
                    phone: formattedPhone,
                },
            },
            create: {
                userId,
                name: lead.name,
                phone: formattedPhone,
                jid: targetJid,
                city: (lead.customFields as any)?.city || null,
                category: (lead.customFields as any)?.category || null,
                website: (lead.customFields as any)?.website || null,
                mapsUrl: (lead.customFields as any)?.mapsUrl || null,
                placeId: (lead.customFields as any)?.placeId || null,
                status: "CONTACTED",
                contactedAt: new Date(),
                lastOutboundAt: new Date(),
            },
            update: {
                jid: targetJid,
                status: "CONTACTED",
                contactedAt: new Date(),
                lastOutboundAt: new Date(),
                aiPaused: false, // Deixa a IA pronta para responder quando o cliente falar
            },
        });

        // 2. Registra a mensagem enviada no histórico da Prospecção
        await prisma.prospectMessage.create({
            data: {
                leadId: prospectLead.id,
                fromMe: true,
                byAI: false,
                content: textToSend,
                keyId,
            },
        });

        // 3. Registra a atividade no CRM
        await prisma.crmLeadActivity.create({
            data: {
                leadId: lead.id,
                userId,
                type: "WHATSAPP_MSG",
                title: "Primeiro contato enviado",
                content: textToSend,
            },
        });

        logger.success("CRM", `Primeiro contato enviado para ${lead.name} (${formattedPhone})`);
        return { success: true };
    } catch (err: any) {
        logger.error("CRM", "Erro ao disparar primeiro contato para lead", err);
        return { success: false, error: err?.message || "Erro no envio via WhatsApp" };
    }
}
