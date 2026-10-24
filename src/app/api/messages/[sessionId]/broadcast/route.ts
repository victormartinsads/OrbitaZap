import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { waManager } from "@/modules/whatsapp/manager";
import { getAuthenticatedUser, canAccessSession } from "@/lib/api-auth";
import { clampInterval, runBroadcast } from "@/modules/broadcast/runner";
import { apiError } from "@/lib/api-error";
import { assertSessionOwnerActive } from "@/lib/billing/access";
import { z } from "zod";

const broadcastBodySchema = z.object({
    recipients: z.array(z.string()).max(10_000),
    message: z.string().max(4096),
    name: z.string().max(120).optional(),
    mediaAssetId: z.string().optional(),
    pauseOnFailure: z.boolean().optional(),
    skipOptedOut: z.boolean().optional(),
    scheduledAt: z.string().optional(),
    delay: z.number().optional(), // legacy: milliseconds
    interval: z.object({ value: z.number().positive(), unit: z.enum(["seconds", "minutes"]) }).optional(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });
        }

        const { sessionId } = await params;
        const body = await request.json();

        const parseResult = broadcastBodySchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json({ error: parseResult.error.flatten() }, { status: 400 });
        }

        const { message, delay, interval, name, mediaAssetId, pauseOnFailure, skipOptedOut = true, scheduledAt } = parseResult.data;
        const bad = (m: string) => NextResponse.json({ status: false, message: m, error: m }, { status: 400 });
        if (!message.trim() && !mediaAssetId) return bad("Escreva a mensagem ou anexe um arquivo");
        // Numbers typed or imported become phone JIDs; duplicates are sent once
        let recipients = [...new Set(parseResult.data.recipients.map(s => s.trim()).filter(Boolean).map(s => (s.includes("@") ? s : `${s.replace(/\D/g, "")}@s.whatsapp.net`)))]
            .filter(j => /^\d{8,15}@s\.whatsapp\.net$|@lid$|@g\.us$/.test(j));
        let skippedOptOut = 0;
        if (skipOptedOut) {
            const opted = new Set((await prisma.broadcastOptOut.findMany({ where: { sessionId, jid: { in: recipients } }, select: { jid: true } })).map(o => o.jid));
            skippedOptOut = recipients.filter(j => opted.has(j)).length;
            recipients = recipients.filter(j => !opted.has(j));
        }
        if (!recipients.length) return bad(skippedOptOut ? "Todos os destinatários estão descadastrados" : "Nenhum destinatário válido");
        const when = scheduledAt ? new Date(scheduledAt) : null;
        if (when && (isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000)) return bad("Escolha uma data e horário no futuro");
        const intervalMs = clampInterval(interval ? interval.value * (interval.unit === "minutes" ? 60_000 : 1000) : delay || 10_000);

        const canAccess = await canAccessSession(user.id, user.role, sessionId);
        if (!canAccess) {
            return NextResponse.json({ status: false, message: "Forbidden", error: "Forbidden" }, { status: 403 });
        }

        try {
            await assertSessionOwnerActive(sessionId);
        } catch (e) {
            return apiError(e);
        }

        const instance = waManager.getInstance(sessionId);
        if (!instance?.socket) {
            return NextResponse.json({ status: false, message: "Session not ready", error: "Session not ready" }, { status: 503 });
        }

        // --- Save BroadcastLog & recipients to DB ---
        const log = await prisma.broadcastLog.create({
            data: {
                sessionId,
                message,
                total: recipients.length,
                delay: intervalMs,
                status: when ? "scheduled" : "running",
                name: name?.trim() || null,
                mediaAssetId: mediaAssetId || null,
                pauseOnFailure: !!pauseOnFailure,
                skipOptedOut,
                scheduledAt: when,
                recipients: {
                    create: recipients.map(jid => ({
                        jid,
                        status: "pending"
                    }))
                }
            },
        });

        // Queue lives in the DB; the runner sends one message per interval and can be paused/resumed
        if (!when) runBroadcast(log.id); // scheduled ones are started by the broadcast scheduler

        return NextResponse.json({
            status: true,
            message: "Broadcast started",
            data: { broadcastId: log.id, total: recipients.length, delay: intervalMs, skippedOptOut, scheduledAt: when }
        });

    } catch (e) {
        console.error("Broadcast error", e);
        return NextResponse.json({ status: false, message: "Failed to start broadcast", error: "Failed to start broadcast" }, { status: 500 });
    }
}
