import fs from "fs/promises";
import type { WASocket } from "@whiskeysockets/baileys";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { toOggOpus } from "@/modules/whatsapp/voice";
import { renderBroadcast } from "./template";

// The interval is a pace with humanized jitter to prevent algorithmic WhatsApp spam bans.
export const MIN_INTERVAL_MS = 2_000;
export const MAX_INTERVAL_MS = 60 * 60_000;
export const clampInterval = (ms: number) => {
    const base = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(ms || 0)));
    // Anti-bloqueio humanizado: variacao aleatoria inteligente (+/- 25% + 1 a 3 segundos) para evitar padrao de robo
    const jitter = Math.floor(Math.random() * (base * 0.25)) + Math.floor(Math.random() * 2000) + 1000;
    return base + jitter;
};

const g = global as unknown as { __broadcastRunning?: Set<string> };
const running = (g.__broadcastRunning ??= new Set());

type Io = { to(room: string): { emit(ev: string, data: unknown): void } };
const io = () => (global as unknown as { io?: Io }).io;

async function emit(logId: string, extra: Record<string, unknown> = {}) {
    const log = await prisma.broadcastLog.findUnique({ where: { id: logId } });
    if (!log) return;
    const skipped = await prisma.broadcastRecipient.count({ where: { broadcastLogId: logId, status: "skipped" } });
    const done = log.sent + log.failed + skipped;
    io()?.to(log.sessionId).emit("broadcast.progress", {
        broadcastId: log.id, status: log.status, total: log.total, sent: log.sent, failed: log.failed, skipped, name: log.name,
        progress: log.total ? Math.round((done / log.total) * 100) : 100, delay: log.delay, ...extra,
    });
}

type LogRow = { sessionId: string; message: string; mediaAssetId: string | null };
const dbSessionIds = new Map<string, string>();

/** One recipient: text with variables, or the attachment with the text as caption (voice notes get it as a 2nd message). */
async function sendOne(sock: WASocket, log: LogRow, jid: string) {
    let dbId = dbSessionIds.get(log.sessionId);
    if (!dbId) {
        dbId = (await prisma.session.findUnique({ where: { sessionId: log.sessionId }, select: { id: true } }))?.id;
        if (!dbId) throw new Error("Sessão não encontrada");
        dbSessionIds.set(log.sessionId, dbId);
    }
    const contact = await prisma.contact.findUnique({ where: { sessionId_jid: { sessionId: dbId, jid } }, select: { name: true, notify: true, verifiedName: true } });
    const text = renderBroadcast(log.message, { jid, name: contact?.name || contact?.notify || contact?.verifiedName });
    if (!log.mediaAssetId) return void await sock.sendMessage(jid, { text });

    const asset = await prisma.flowAsset.findFirst({ where: { id: log.mediaAssetId, sessionId: dbId } });
    if (!asset) throw new Error("Anexo não encontrado");
    const buf = await fs.readFile(asset.path);
    const caption = text.trim() ? text : undefined;
    if (asset.mime.startsWith("image/")) return void await sock.sendMessage(jid, { image: buf, caption });
    if (asset.mime.startsWith("video/")) return void await sock.sendMessage(jid, { video: buf, caption });
    if (asset.mime.startsWith("audio/")) {
        await sock.sendMessage(jid, { audio: await toOggOpus(buf), mimetype: "audio/ogg; codecs=opus", ptt: true });
        if (caption) await sock.sendMessage(jid, { text: caption });
        return;
    }
    await sock.sendMessage(jid, { document: buf, mimetype: asset.mime, fileName: asset.originalName, caption });
}

/** Waits `ms`, waking early when the broadcast stops being "running" (pause / cancel take effect at once). */
async function waitInterval(logId: string, ms: number) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        await new Promise(r => setTimeout(r, Math.min(1000, end - Date.now())));
        const s = await prisma.broadcastLog.findUnique({ where: { id: logId }, select: { status: true } });
        if (s?.status !== "running") return;
    }
}

/**
 * Sends the pending recipients of a broadcast one by one, `delay` ms apart, until done, paused or cancelled.
 * State lives in the database, so "resume" is just running this again; one runner per broadcast.
 */
export async function runBroadcast(logId: string) {
    if (running.has(logId)) return;
    running.add(logId);
    try {
        for (;;) {
            const log = await prisma.broadcastLog.findUnique({ where: { id: logId } });
            if (!log || log.status !== "running") break;
            const next = await prisma.broadcastRecipient.findFirst({ where: { broadcastLogId: logId, status: "pending" }, orderBy: { id: "asc" } });
            if (!next) {
                await prisma.broadcastLog.update({ where: { id: logId }, data: { status: "completed", completedAt: new Date() } });
                await emit(logId);
                break;
            }
            const { waManager } = await import("@/modules/whatsapp/manager");
            const inst = waManager.getInstance(log.sessionId);
            if (!inst?.socket || inst.status !== "CONNECTED") {
                // Don't burn the list on a dead session: pause and let the user resume once it's back
                await prisma.broadcastLog.update({ where: { id: logId }, data: { status: "paused" } });
                await emit(logId, { reason: "Sessão do WhatsApp desconectada" });
                break;
            }
            // Opted out after the broadcast was created: skip without waiting an interval
            if (log.skipOptedOut && (await prisma.broadcastOptOut.findUnique({ where: { sessionId_jid: { sessionId: log.sessionId, jid: next.jid } } }))) {
                await prisma.broadcastRecipient.update({ where: { id: next.id }, data: { status: "skipped", error: "Contato descadastrado" } });
                await emit(logId, { current: next.jid });
                continue;
            }
            let failedNow: string | null = null;
            try {
                await sendOne(inst.socket as WASocket, log, next.jid);
                await prisma.broadcastRecipient.update({ where: { id: next.id }, data: { status: "sent", sentAt: new Date() } });
                await prisma.broadcastLog.update({ where: { id: logId }, data: { sent: { increment: 1 } } });
            } catch (e) {
                failedNow = (e as Error)?.message || "Erro desconhecido";
                await prisma.broadcastRecipient.update({ where: { id: next.id }, data: { status: "failed", error: failedNow } });
                await prisma.broadcastLog.update({ where: { id: logId }, data: { failed: { increment: 1 } } });
            }
            if (failedNow && log.pauseOnFailure) {
                await prisma.broadcastLog.update({ where: { id: logId }, data: { status: "paused" } });
                await emit(logId, { current: next.jid, reason: `falha ao enviar (${failedNow}). Revise e retome.` });
                break;
            }
            await emit(logId, { current: next.jid });
            const more = await prisma.broadcastRecipient.count({ where: { broadcastLogId: logId, status: "pending" } });
            if (more) await waitInterval(logId, clampInterval(log.delay));
        }
    } catch (e) {
        logger.error("Broadcast", `runner ${logId} failed`, e);
        await prisma.broadcastLog.update({ where: { id: logId }, data: { status: "paused" } }).catch(() => undefined);
        await emit(logId, { reason: "Erro interno; você pode retomar" }).catch(() => undefined);
    } finally {
        running.delete(logId);
    }
}

/** Pause / resume / cancel. Returns the new status, or an error message. */
export async function controlBroadcast(logId: string, action: "pause" | "resume" | "cancel"): Promise<{ status?: string; error?: string }> {
    const log = await prisma.broadcastLog.findUnique({ where: { id: logId } });
    if (!log) return { error: "Transmissão não encontrada" };
    const open = log.status === "running" || log.status === "paused" || log.status === "scheduled";
    if (!open) return { error: "Esta transmissão já terminou" };
    if (log.status === "scheduled" && action !== "cancel") return { error: "Transmissão agendada: só é possível cancelar" };
    if (action === "pause") {
        if (log.status !== "running") return { error: "A transmissão não está em andamento" };
        await prisma.broadcastLog.update({ where: { id: logId }, data: { status: "paused" } });
    } else if (action === "resume") {
        if (log.status !== "paused") return { error: "A transmissão não está pausada" };
        await prisma.broadcastLog.update({ where: { id: logId }, data: { status: "running" } });
        runBroadcast(logId);
    } else {
        await prisma.broadcastLog.update({ where: { id: logId }, data: { status: "cancelled", completedAt: new Date() } });
    }
    await emit(logId);
    return { status: action === "pause" ? "paused" : action === "resume" ? "running" : "cancelled" };
}

/** At startup nothing is sending yet: broadcasts left "running" by a restart become "paused" (resumable). */
export async function pauseOrphanedBroadcasts() {
    const res = await prisma.broadcastLog.updateMany({ where: { status: "running", id: { notIn: [...running] } }, data: { status: "paused" } });
    if (res.count) logger.info("Broadcast", `${res.count} transmissão(ões) interrompida(s) pelo reinício ficaram pausadas`);
}

/** Starts scheduled broadcasts whose time has come; checked every 15 s. */
export function startBroadcastScheduler() {
    const gg = global as unknown as { __broadcastTimer?: NodeJS.Timeout };
    if (gg.__broadcastTimer) return;
    gg.__broadcastTimer = setInterval(async () => {
        try {
            const due = await prisma.broadcastLog.findMany({ where: { status: "scheduled", scheduledAt: { lte: new Date() } }, select: { id: true } });
            for (const { id } of due) {
                // Atomic claim: only one process/tick starts it
                const claimed = await prisma.broadcastLog.updateMany({ where: { id, status: "scheduled" }, data: { status: "running", startedAt: new Date() } });
                if (claimed.count) { await emit(id); runBroadcast(id); }
            }
        } catch (e) { logger.error("Broadcast", "scheduler tick failed", e); }
    }, 15_000);
}
