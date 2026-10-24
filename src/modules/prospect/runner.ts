import type { WASocket } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const g = global as unknown as { __prospectRunning?: Set<string> };
const running = (g.__prospectRunning ??= new Set());

type Io = { to(room: string): { emit(ev: string, data: unknown): void }; emit(ev: string, data: unknown): void };
const getIo = () => (global as unknown as { io?: Io }).io;

/**
 * Spintax `{Oi|Olá|Bom dia}` -> escolhe uma opção aleatória.
 * Suporta aninhamento simples.
 */
export function resolveSpintax(text: string): string {
    return text.replace(/\{([^{}]+)\}/g, (_, choices) => {
        const parts = choices.split("|");
        return parts[Math.floor(Math.random() * parts.length)] || "";
    });
}

/**
 * Substitui variáveis do lead:
 * {nome}, {primeiro_nome}, {cidade}, {nicho}, {endereco}
 * + resolve spintax {Oi|Olá|Bom dia}.
 */
export function renderProspectMessage(
    template: string,
    lead: { name: string; city?: string | null; category?: string | null; address?: string | null }
): string {
    const rawName = (lead.name || "").trim();
    // Limpa sufixos empresariais comuns no primeiro nome
    const cleanFirst = rawName.split(/\s+/)[0] || "";
    const vars: Record<string, string> = {
        nome: rawName,
        primeiro_nome: cleanFirst,
        cidade: (lead.city || "").trim(),
        nicho: (lead.category || "").trim(),
        endereco: (lead.address || "").trim(),
    };

    let rendered = template.replace(/\{\{\s*([\w]+)\s*\}\}|\{([\w]+)\}/g, (match, k1, k2) => {
        const k = (k1 || k2 || "").toLowerCase();
        return k in vars ? vars[k] : match;
    });

    return resolveSpintax(rendered).trim();
}

/**
 * Verifica se o momento atual está dentro do horário comercial configurado (hora local).
 */
export function isWithinWorkHours(start = 9, end = 18): boolean {
    const now = new Date();
    // Usa a hora local do servidor/ambiente (ajustada para o fuso brasileiro padrão)
    const hour = now.getHours();
    return hour >= start && hour < end;
}

/**
 * Conta quantos disparos foram feitos hoje (00:00 até agora) pelo usuário.
 */
export async function countDispatchedToday(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return await prisma.prospectLead.count({
        where: {
            userId,
            contactedAt: { gte: today },
            status: { in: ["CONTACTED", "CONVERSING", "INTERESTED", "NOT_INTERESTED", "OPTED_OUT"] },
        },
    });
}

/**
 * Simula digitação humana antes de enviar.
 */
async function simulateTyping(sock: WASocket, jid: string, text: string) {
    try {
        await sock.sendPresenceUpdate("composing", jid);
        // Calcula tempo baseado na leitura/digitação: ~20-30ms por caractere, entre 1.5s e 4s
        const duration = Math.min(4000, Math.max(1500, text.length * 25));
        await new Promise((r) => setTimeout(r, duration));
        await sock.sendPresenceUpdate("paused", jid);
    } catch {
        // Ignora erro de presence se a sessão oscilar
    }
}

/**
 * Emite evento socket de progresso da campanha para a interface em tempo real.
 */
export async function emitCampaignProgress(campaignId: string, sessionId?: string | null, extra: Record<string, unknown> = {}) {
    const campaign = await prisma.prospectCampaign.findUnique({
        where: { id: campaignId },
        include: {
            _count: {
                select: { leads: true },
            },
        },
    });
    if (!campaign) return;

    const [queued, contacted, conversing, interested, notInterested, noWa, failed] = await Promise.all([
        prisma.prospectLead.count({ where: { campaignId, status: { in: ["NEW", "QUEUED"] } } }),
        prisma.prospectLead.count({ where: { campaignId, status: "CONTACTED" } }),
        prisma.prospectLead.count({ where: { campaignId, status: "CONVERSING" } }),
        prisma.prospectLead.count({ where: { campaignId, status: "INTERESTED" } }),
        prisma.prospectLead.count({ where: { campaignId, status: "NOT_INTERESTED" } }),
        prisma.prospectLead.count({ where: { campaignId, status: "NO_WHATSAPP" } }),
        prisma.prospectLead.count({ where: { campaignId, status: "FAILED" } }),
    ]);

    const total = campaign._count.leads;
    const done = total - queued;

    const payload = {
        campaignId: campaign.id,
        name: campaign.name,
        status: campaign.status,
        pauseReason: campaign.pauseReason,
        total,
        queued,
        contacted,
        conversing,
        interested,
        notInterested,
        noWa,
        failed,
        progress: total > 0 ? Math.round((done / total) * 100) : 0,
        ...extra,
    };

    const io = getIo();
    if (sessionId) io?.to(sessionId).emit("prospect.progress", payload);
    io?.emit("prospect.campaignUpdate", payload);
}

/**
 * Loop principal de disparo de uma campanha.
 */
export async function runProspectCampaign(campaignId: string) {
    if (running.has(campaignId)) return;
    running.add(campaignId);

    try {
        for (;;) {
            const campaign = await prisma.prospectCampaign.findUnique({
                where: { id: campaignId },
            });
            if (!campaign || campaign.status !== "RUNNING") break;

            const config = await prisma.prospectConfig.findUnique({
                where: { userId: campaign.userId },
            });

            // 1. Validar horário comercial
            const startHour = config?.workStart ?? 9;
            const endHour = config?.workEnd ?? 18;
            if (!isWithinWorkHours(startHour, endHour)) {
                await prisma.prospectCampaign.update({
                    where: { id: campaignId },
                    data: {
                        status: "PAUSED",
                        pauseReason: `Fora do horário comercial (${startHour}h às ${endHour}h). A campanha aguardará o próximo turno.`,
                    },
                });
                await emitCampaignProgress(campaignId, config?.sessionId);
                break;
            }

            // 2. Validar limite diário de novos contatos
            const dailyLimit = config?.dailyLimit ?? 40;
            const sentToday = await countDispatchedToday(campaign.userId);
            if (sentToday >= dailyLimit) {
                await prisma.prospectCampaign.update({
                    where: { id: campaignId },
                    data: {
                        status: "PAUSED",
                        pauseReason: `Limite diário de segurança atingido (${sentToday}/${dailyLimit}). A campanha continuará amanhã para proteger seu número.`,
                    },
                });
                await emitCampaignProgress(campaignId, config?.sessionId);
                break;
            }

            // 3. Obter sessão Baileys conectada
            const sessionId = config?.sessionId;
            if (!sessionId) {
                await prisma.prospectCampaign.update({
                    where: { id: campaignId },
                    data: { status: "PAUSED", pauseReason: "Nenhuma sessão do WhatsApp configurada para disparo." },
                });
                await emitCampaignProgress(campaignId);
                break;
            }

            const { waManager } = await import("@/modules/whatsapp/manager");
            const inst = waManager.getInstance(sessionId);
            if (!inst?.socket || inst.status !== "CONNECTED") {
                await prisma.prospectCampaign.update({
                    where: { id: campaignId },
                    data: { status: "PAUSED", pauseReason: "Sessão do WhatsApp desconectada. Conecte seu aparelho e retome." },
                });
                await emitCampaignProgress(campaignId, sessionId);
                break;
            }

            // 4. Buscar próximo lead na fila
            const lead = await prisma.prospectLead.findFirst({
                where: {
                    campaignId,
                    status: { in: ["NEW", "QUEUED"] },
                },
                orderBy: { createdAt: "asc" },
            });

            if (!lead) {
                // Todos os leads foram processados!
                await prisma.prospectCampaign.update({
                    where: { id: campaignId },
                    data: { status: "DONE", pauseReason: null },
                });
                await emitCampaignProgress(campaignId, sessionId);
                break;
            }

            // 5. Verificar se o número tem WhatsApp ativo (onWhatsApp)
            const sock = inst.socket as WASocket;
            let targetJid: string | null = null;
            try {
                const results = await sock.onWhatsApp(lead.phone);
                const match = results?.find((r) => r.exists);
                if (match?.jid) {
                    targetJid = match.jid;
                }
            } catch (err) {
                logger.warn("Prospect", `Falha ao validar onWhatsApp para ${lead.phone}`, err);
                // Fallback: tenta enviar no formato padrão se onWhatsApp oscilar
                targetJid = `${lead.phone}@s.whatsapp.net`;
            }

            if (!targetJid) {
                // Número não possui conta no WhatsApp
                await prisma.prospectLead.update({
                    where: { id: lead.id },
                    data: {
                        status: "NO_WHATSAPP",
                        error: "Número não cadastrado no WhatsApp",
                    },
                });
                await emitCampaignProgress(campaignId, sessionId, { currentPhone: lead.phone });
                continue;
            }

            // 6. Montar e enviar a mensagem de abertura
            const textToSend = renderProspectMessage(campaign.openingMessage, {
                name: lead.name,
                city: lead.city,
                category: lead.category,
                address: lead.address,
            });

            try {
                await simulateTyping(sock, targetJid, textToSend);

                const sentResult = await sock.sendMessage(targetJid, { text: textToSend });
                const keyId = sentResult?.key?.id || `PROSP_${Date.now()}`;

                // Salva mensagem no histórico do lead
                await prisma.prospectMessage.create({
                    data: {
                        leadId: lead.id,
                        fromMe: true,
                        byAI: false,
                        content: textToSend,
                        keyId,
                    },
                });

                // Atualiza lead como CONTACTED
                await prisma.prospectLead.update({
                    where: { id: lead.id },
                    data: {
                        jid: targetJid,
                        status: "CONTACTED",
                        contactedAt: new Date(),
                        lastOutboundAt: new Date(),
                        error: null,
                    },
                });

                logger.info("Prospect", `[Campanha ${campaign.name}] Disparo enviado para ${lead.name} (${targetJid})`);
            } catch (sendErr: any) {
                logger.error("Prospect", `Erro ao enviar disparo para ${lead.phone}`, sendErr);
                await prisma.prospectLead.update({
                    where: { id: lead.id },
                    data: {
                        status: "FAILED",
                        error: sendErr?.message || "Erro no envio via WhatsApp",
                    },
                });
            }

            await emitCampaignProgress(campaignId, sessionId, { currentPhone: lead.phone });

            // 7. Intervalo de segurança anti-ban entre disparos
            const minDelay = Math.max(30, config?.minDelaySec ?? 90);
            const maxDelay = Math.max(minDelay + 10, config?.maxDelaySec ?? 240);
            // Sorteia um tempo aleatório humanizado
            const delaySec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            const delayMs = delaySec * 1000;

            logger.info("Prospect", `Aguardando ${delaySec}s até o próximo disparo anti-spam...`);

            // Espera com checagem de interrupção (pausa imediata se usuário clicar Pausar)
            const endTime = Date.now() + delayMs;
            while (Date.now() < endTime) {
                await new Promise((r) => setTimeout(r, 1000));
                const current = await prisma.prospectCampaign.findUnique({
                    where: { id: campaignId },
                    select: { status: true },
                });
                if (current?.status !== "RUNNING") break;
            }
        }
    } catch (e) {
        logger.error("Prospect", `Falha crítica no runner da campanha ${campaignId}`, e);
        await prisma.prospectCampaign.update({
            where: { id: campaignId },
            data: { status: "PAUSED", pauseReason: "Erro inesperado na execução da campanha." },
        }).catch(() => {});
        await emitCampaignProgress(campaignId);
    } finally {
        running.delete(campaignId);
    }
}

/**
 * Controla status da campanha (iniciar, pausar, resetar).
 */
export async function controlProspectCampaign(campaignId: string, action: "start" | "pause" | "reset") {
    const campaign = await prisma.prospectCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new Error("Campanha não encontrada");

    if (action === "start") {
        await prisma.prospectCampaign.update({
            where: { id: campaignId },
            data: { status: "RUNNING", pauseReason: null },
        });
        // Roda em segundo plano
        runProspectCampaign(campaignId).catch((err) =>
            logger.error("Prospect", "Erro ao executar campanha em background", err)
        );
        await emitCampaignProgress(campaignId);
        return { status: "RUNNING" };
    }

    if (action === "pause") {
        await prisma.prospectCampaign.update({
            where: { id: campaignId },
            data: { status: "PAUSED", pauseReason: "Pausada pelo usuário." },
        });
        await emitCampaignProgress(campaignId);
        return { status: "PAUSED" };
    }

    if (action === "reset") {
        // Coloca leads que falharam ou estão pendentes de volta para QUEUED
        await prisma.prospectLead.updateMany({
            where: {
                campaignId,
                status: { in: ["FAILED", "NO_WHATSAPP"] },
            },
            data: { status: "QUEUED", error: null },
        });
        await prisma.prospectCampaign.update({
            where: { id: campaignId },
            data: { status: "DRAFT", pauseReason: null },
        });
        await emitCampaignProgress(campaignId);
        return { status: "DRAFT" };
    }

    throw new Error("Ação inválida");
}

/**
 * Cron scheduler para retomar campanhas ativas no reinício do servidor
 * ou verificar horários comerciais a cada 1 minuto.
 */
export function startProspectScheduler() {
    const gg = global as unknown as { __prospectTimer?: NodeJS.Timeout };
    if (gg.__prospectTimer) return;

    gg.__prospectTimer = setInterval(async () => {
        try {
            // Verifica campanhas que deveriam estar rodando mas foram interrompidas por reboot
            const activeCampaigns = await prisma.prospectCampaign.findMany({
                where: { status: "RUNNING" },
                select: { id: true },
            });
            for (const camp of activeCampaigns) {
                if (!running.has(camp.id)) {
                    runProspectCampaign(camp.id).catch((err) =>
                        logger.error("Prospect", `Erro ao auto-retomar campanha ${camp.id}`, err)
                    );
                }
            }
        } catch (e) {
            logger.error("Prospect", "Scheduler tick error", e);
        }
    }, 60_000);
}
