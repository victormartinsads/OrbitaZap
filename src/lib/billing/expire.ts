import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { waManager } from "@/modules/whatsapp/manager";
import { getBillingState } from "./access";

const DAY = 24 * 60 * 60 * 1000;

async function stopUserSessions(userId: string) {
    const sessions = await prisma.session.findMany({ where: { userId }, select: { sessionId: true } });
    for (const s of sessions) {
        await waManager.stopSession(s.sessionId).catch(e => logger.error("Billing", `stop ${s.sessionId}`, e));
    }
}

/** Marca como EXPIRED quem perdeu o acesso, para as sessões dessas pessoas e avisa trials perto do fim. */
export async function runBillingExpiration() {
    const candidates = await prisma.subscription.findMany({
        where: { status: { in: ["TRIALING", "PAST_DUE", "CANCELED"] }, user: { role: { not: "SUPERADMIN" } } },
        select: { id: true, userId: true, status: true, trialEndsAt: true, trialReminderSent: true },
    });

    let expired = 0;
    for (const sub of candidates) {
        const state = await getBillingState(sub.userId);

        if (!state.isActive) {
            await prisma.subscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
            await stopUserSessions(sub.userId);
            await prisma.notification.create({
                data: {
                    userId: sub.userId,
                    title: sub.status === "TRIALING" ? "Seu teste grátis terminou" : "Sua assinatura expirou",
                    message: "Seus WhatsApps foram pausados. Escolha um plano para reativá-los — nada foi apagado.",
                    type: "WARNING",
                    href: "/dashboard/billing",
                },
            });
            expired++;
            continue;
        }

        const trialEnd = sub.trialEndsAt?.getTime();
        if (sub.status === "TRIALING" && trialEnd && !sub.trialReminderSent && trialEnd - Date.now() <= 2 * DAY) {
            await prisma.subscription.update({ where: { id: sub.id }, data: { trialReminderSent: true } });
            await prisma.notification.create({
                data: {
                    userId: sub.userId,
                    title: "Seu teste grátis está acabando",
                    message: "Faltam menos de 2 dias. Assine um plano para não pausar seus WhatsApps.",
                    type: "INFO",
                    href: "/dashboard/billing",
                },
            });
        }
    }

    if (expired) logger.info("Billing", `${expired} assinatura(s) expirada(s)`);
}
