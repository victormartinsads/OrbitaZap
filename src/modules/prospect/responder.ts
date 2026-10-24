import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { normalizeMessageContent } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { generateProspectReply } from "./gemini";

// Fila em memória para agrupar mensagens consecutivas do lead (debounce)
interface LeadPendingDebounce {
    timer: NodeJS.Timeout;
    leadId: string;
    sock: WASocket;
    remoteJid: string;
    sessionId: string;
}

const pendingDebounces = new Map<string, LeadPendingDebounce>();

/**
 * Verifica se um JID pertence a um lead ativo da Prospecção.
 * Utilizado por autoreply e flows para NÃO responder leads de prospecção com robôs paralelos.
 */
export async function isActiveProspectLead(sessionId: string, jids: (string | null | undefined)[]): Promise<boolean> {
    const list = jids.filter(Boolean) as string[];
    if (!list.length) return false;

    // Busca o dono da sessão
    const session = await prisma.session.findUnique({
        where: { sessionId },
        select: { userId: true },
    });
    if (!session) return false;

    // Limpa os JIDs para extrair números de telefone se houver
    const phones = list
        .map((j) => {
            if (j.includes("@s.whatsapp.net")) return j.split("@")[0].split(":")[0];
            return null;
        })
        .filter(Boolean) as string[];

    const leadCount = await prisma.prospectLead.count({
        where: {
            userId: session.userId,
            OR: [
                { jid: { in: list } },
                { lid: { in: list } },
                { phone: { in: phones } },
            ],
            // Apenas leads que foram contactados e não optaram por sair
            status: { in: ["CONTACTED", "CONVERSING", "INTERESTED", "NEW", "QUEUED"] },
        },
    });

    return leadCount > 0;
}

/**
 * Localiza o lead correspondente a uma mensagem recebida ou enviada no WhatsApp.
 */
async function findLeadForMessage(userId: string, remoteJid: string, remoteJidAlt?: string | null) {
    const candidates = [remoteJid, remoteJidAlt].filter(Boolean) as string[];
    const phones = candidates
        .map((j) => (j.includes("@s.whatsapp.net") ? j.split("@")[0].split(":")[0] : null))
        .filter(Boolean) as string[];

    return await prisma.prospectLead.findFirst({
        where: {
            userId,
            OR: [
                { jid: { in: candidates } },
                { lid: { in: candidates } },
                { phone: { in: phones } },
            ],
        },
        include: {
            messages: {
                orderBy: { createdAt: "asc" },
                take: 40,
            },
        },
    });
}

/**
 * Envia notificação interna no MarcFlow e opcionalmente via WhatsApp para o número pessoal do dono.
 */
async function notifyOwner(userId: string, sock: WASocket, notifyPhone: string | null | undefined, leadName: string, leadPhone: string, summary: string) {
    try {
        const title = `🔥 Lead Quente: ${leadName}`;
        const message = `O lead demonstrou interesse em criar um site!\nResumo da IA: ${summary}\nTelefone: ${leadPhone}`;

        // 1. Notificação no painel web
        await prisma.notification.create({
            data: {
                userId,
                title,
                message,
                type: "SUCCESS",
                href: "/dashboard/prospect",
            },
        });

        // 2. Mensagem no WhatsApp pessoal do dono (se configurado)
        if (notifyPhone) {
            const cleanPhone = notifyPhone.replace(/\D/g, "");
            if (cleanPhone) {
                const targetJid = cleanPhone.includes("@") ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;
                await sock.sendMessage(targetJid, {
                    text: `*${title}*\n\n${message}\n\n👉 Acesse o painel de Prospecção para assumir o atendimento.`,
                });
            }
        }
    } catch (err) {
        logger.error("Prospect", "Falha ao enviar notificação de lead interessado", err);
    }
}

/**
 * Processa a resposta do lead com o Gemini após o tempo de debounce.
 */
async function processLeadReplyWithAI(leadId: string, sock: WASocket, remoteJid: string, sessionId: string) {
    try {
        const lead = await prisma.prospectLead.findUnique({
            where: { id: leadId },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                    take: 30,
                },
            },
        });

        if (!lead) return;

        // Se a IA estiver pausada ou o lead já tiver saído, não responder
        if (lead.aiPaused || lead.status === "OPTED_OUT" || lead.status === "NOT_INTERESTED") {
            return;
        }

        const config = await prisma.prospectConfig.findUnique({
            where: { userId: lead.userId },
        });

        if (!config || !config.aiEnabled || !config.geminiApiKey) {
            logger.warn("Prospect", "IA desativada ou sem chave configurada para o usuário");
            return;
        }

        // Formata histórico para o contexto do Gemini
        const history = lead.messages.map((m) => ({
            fromMe: m.fromMe,
            content: m.content,
        }));

        logger.info("Prospect", `Consultando Gemini para lead ${lead.name} (${lead.phone})...`);

        // Simula presença "composing" enquanto a IA pensa e digita
        await sock.sendPresenceUpdate("composing", remoteJid).catch(() => {});

        const aiResult = await generateProspectReply({
            apiKey: config.geminiApiKey,
            model: config.geminiModel || "gemini-flash-latest",
            persona: config.persona || "Marcos, da agência",
            offerText: config.offerText || "",
            extraRules: config.extraRules || "",
            lead: {
                name: lead.name,
                category: lead.category,
                city: lead.city,
                website: lead.website,
                rating: lead.rating,
                reviews: lead.reviews,
            },
            history,
        });

        await sock.sendPresenceUpdate("paused", remoteJid).catch(() => {});

        // Envia mensagem se a IA gerou resposta
        let keyId: string | null = null;
        if (aiResult.reply) {
            // Pequeno delay humanizado proporcional ao tamanho da resposta
            const typingDelay = Math.min(4500, Math.max(1200, aiResult.reply.length * 20));
            await new Promise((r) => setTimeout(r, typingDelay));

            const sent = await sock.sendMessage(remoteJid, { text: aiResult.reply });
            keyId = sent?.key?.id || `AI_${Date.now()}`;

            // Registra a resposta enviada pela IA
            await prisma.prospectMessage.create({
                data: {
                    leadId: lead.id,
                    fromMe: true,
                    byAI: true,
                    content: aiResult.reply,
                    keyId,
                },
            });
        }

        // Determina novo status com base na intenção
        let newStatus = lead.status;
        let aiPaused: boolean = Boolean(lead.aiPaused);

        if (aiResult.intent === "opt_out") {
            newStatus = "OPTED_OUT";
            aiPaused = true;
            // Registra no OptOut geral do MarcFlow para nunca mais incomodar
            await prisma.broadcastOptOut.upsert({
                where: { sessionId_jid: { sessionId, jid: remoteJid } },
                create: { sessionId, jid: remoteJid },
                update: {},
            }).catch(() => {});
        } else if (aiResult.intent === "not_interested") {
            newStatus = "NOT_INTERESTED";
            aiPaused = true;
        } else if (aiResult.intent === "interested" || aiResult.handoff) {
            newStatus = "INTERESTED";
            aiPaused = true; // PAUSA A IA PARA O HUMANO ASSUMIR!
            await notifyOwner(lead.userId, sock, config.notifyPhone, lead.name, lead.phone, aiResult.summary);

            // QUALIFICAÇÃO NO CRM: Move o lead automaticamente para "Qualificação" ou "Negociação" se existir no Kanban
            try {
                const crmLead = await prisma.crmLead.findFirst({
                    where: { userId: lead.userId, phone: lead.phone },
                    include: { pipeline: { include: { stages: { orderBy: { order: "asc" } } } } },
                });
                if (crmLead && crmLead.pipeline) {
                    const targetStage = crmLead.pipeline.stages.find(
                        s => s.name.toLowerCase().includes("qualifica") || s.name.toLowerCase().includes("negocia")
                    );
                    if (targetStage && targetStage.id !== crmLead.stageId) {
                        await prisma.crmLead.update({
                            where: { id: crmLead.id },
                            data: {
                                stageId: targetStage.id,
                                activities: {
                                    create: {
                                        userId: lead.userId,
                                        type: "STAGE_CHANGE",
                                        title: "Lead qualificado pela IA",
                                        content: `Gemini qualificou o lead como interessado: "${aiResult.summary}"`,
                                    },
                                },
                            },
                        });
                        logger.info("CRM", `Lead ${crmLead.name} movido automaticamente para a etapa ${targetStage.name} no CRM`);
                    }
                }
            } catch (syncErr) {
                logger.warn("CRM", "Falha ao sincronizar etapa no CRM após qualificação", syncErr);
            }
        } else {
            // Continua em conversação
            newStatus = "CONVERSING";
        }

        await prisma.prospectLead.update({
            where: { id: lead.id },
            data: {
                status: newStatus,
                aiPaused,
                aiSummary: aiResult.summary || lead.aiSummary,
                lastIntent: aiResult.intent,
                lastOutboundAt: new Date(),
            },
        });

        // Emite evento socket para atualizar a tela de conversas do painel
        const io = (global as unknown as { io?: any }).io;
        io?.emit("prospect.message", {
            leadId: lead.id,
            status: newStatus,
            intent: aiResult.intent,
            summary: aiResult.summary,
            lastMessage: aiResult.reply,
        });

        logger.success("Prospect", `IA respondeu para ${lead.name} [Intenção: ${aiResult.intent}, Handoff: ${aiResult.handoff}]`);
    } catch (error: any) {
        logger.error("Prospect", `Erro ao processar resposta com IA para lead ${leadId}`, error);
    }
}

/**
 * Vincula o listener de mensagens do WhatsApp para monitorar conversas com leads.
 */
export function bindProspectResponder(sock: WASocket, sessionId: string) {
    if ((sock as any).__prospectBound) return;
    (sock as any).__prospectBound = true;

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        // Busca o dono da sessão
        const session = await prisma.session.findUnique({
            where: { sessionId },
            select: { userId: true },
        });
        if (!session) return;

        for (const msg of messages) {
            const remoteJid = msg.key.remoteJid;
            if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid === "status@broadcast" || remoteJid.endsWith("@newsletter")) {
                continue;
            }

            const fromMe = !!msg.key.fromMe;
            const remoteJidAlt = (msg.key as any).remoteJidAlt;

            // Extrai texto da mensagem
            const content = normalizeMessageContent(msg.message);
            let text = content?.conversation || content?.extendedTextMessage?.text || "";
            if (!text && content?.imageMessage?.caption) text = `[Imagem] ${content.imageMessage.caption}`;
            else if (!text && content?.audioMessage) text = "[Áudio enviado pelo lead]";
            else if (!text && content?.videoMessage) text = "[Vídeo enviado pelo lead]";
            else if (!text && content?.documentMessage) text = `[Documento] ${content.documentMessage.fileName || ""}`;

            if (!text) continue;

            const lead = await findLeadForMessage(session.userId, remoteJid, remoteJidAlt);
            if (!lead) continue;

            // Se a mensagem partiu DE MIM pelo celular físico (atendimento humano manual):
            // Não processa com IA e PAUSA a IA automaticamente para não haver conflito!
            if (fromMe) {
                // Se foi uma mensagem gerada pelo próprio sistema ou pela IA, já salvamos na tabela
                const existingMsg = await prisma.prospectMessage.findFirst({
                    where: { keyId: msg.key.id },
                });
                if (!existingMsg) {
                    // Mensagem enviada manualmente pelo operador no celular!
                    await prisma.prospectMessage.create({
                        data: {
                            leadId: lead.id,
                            fromMe: true,
                            byAI: false,
                            content: text,
                            keyId: msg.key.id,
                        },
                    });
                    // Pausa a IA porque o humano assumiu o controle
                    if (!lead.aiPaused) {
                        await prisma.prospectLead.update({
                            where: { id: lead.id },
                            data: {
                                aiPaused: true,
                                status: lead.status === "CONTACTED" ? "CONVERSING" : lead.status,
                            },
                        });
                        logger.info("Prospect", `Atendimento manual detectado no lead ${lead.name}. IA pausada.`);
                    }
                }
                continue;
            }

            // --- Mensagem recebida DO LEAD ---
            // Salva no histórico
            await prisma.prospectMessage.create({
                data: {
                    leadId: lead.id,
                    fromMe: false,
                    byAI: false,
                    content: text,
                    keyId: msg.key.id,
                },
            });

            // Atualiza status do lead
            await prisma.prospectLead.update({
                where: { id: lead.id },
                data: {
                    jid: remoteJid,
                    lastInboundAt: new Date(),
                    unread: { increment: 1 },
                    status: lead.status === "CONTACTED" ? "CONVERSING" : lead.status,
                },
            });

            // Se a IA estiver pausada, apenas salva a mensagem para o operador humano
            if (lead.aiPaused || lead.status === "OPTED_OUT") {
                continue;
            }

            // Mecanismo de Debounce (espera 25 segundos para agrupar mensagens seguidas do lead)
            const debounceKey = `${sessionId}:${lead.id}`;
            const existingTimer = pendingDebounces.get(debounceKey);
            if (existingTimer) {
                clearTimeout(existingTimer.timer);
            }

            logger.info("Prospect", `Lead ${lead.name} enviou mensagem. Agendando resposta da IA em 25s (debounce)...`);

            const timer = setTimeout(() => {
                pendingDebounces.delete(debounceKey);
                processLeadReplyWithAI(lead.id, sock, remoteJid, sessionId).catch((err) =>
                    logger.error("Prospect", "Erro na execução da IA", err)
                );
            }, 25_000);

            pendingDebounces.set(debounceKey, {
                timer,
                leadId: lead.id,
                sock,
                remoteJid,
                sessionId,
            });
        }
    });
}
