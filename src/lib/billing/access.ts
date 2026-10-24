import type { Plan, Subscription } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = parseInt(process.env.TRIAL_DAYS || "7", 10);
export const GRACE_DAYS = parseInt(process.env.BILLING_GRACE_DAYS || "3", 10);

export type BillingErrorCode = "SUBSCRIPTION_INACTIVE" | "PLAN_LIMIT" | "EMAIL_NOT_VERIFIED";

export class BillingError extends Error {
    status: number;
    constructor(public code: BillingErrorCode, message: string) {
        super(message);
        this.name = "BillingError";
        this.status = code === "EMAIL_NOT_VERIFIED" ? 403 : 402;
    }
}

export async function assertEmailVerified(userId: string, role?: string) {
    if (role === "SUPERADMIN") return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
    if (!user?.emailVerifiedAt) {
        throw new BillingError("EMAIL_NOT_VERIFIED", "Confirme seu e-mail para continuar. Enviamos o link no cadastro; você pode reenviar pelo aviso no topo.");
    }
}

export type BillingReason =
    | "superadmin"
    | "trial"
    | "active"
    | "grace"
    | "trial_expired"
    | "past_due"
    | "canceled"
    | "expired"
    | "no_subscription";

export interface BillingState {
    isActive: boolean;
    reason: BillingReason;
    subscription: (Subscription & { plan: Plan }) | null;
    plan: Plan | null;
    maxSessions: number;
    /** Prazo relevante: fim do trial, fim da carência ou fim do período pago. */
    deadline: Date | null;
    daysLeft: number | null;
}

function daysUntil(date: Date | null): number | null {
    if (!date) return null;
    return Math.max(0, Math.ceil((date.getTime() - Date.now()) / DAY));
}

/** Prazo da carência de uma assinatura em atraso: vencimento mais antigo em aberto + GRACE_DAYS. */
async function graceDeadline(subscriptionId: string): Promise<Date | null> {
    const overdue = await prisma.payment.findFirst({
        where: { subscriptionId, status: { in: ["OVERDUE", "PENDING"] } },
        orderBy: { dueDate: "asc" },
        select: { dueDate: true },
    });
    return overdue ? new Date(overdue.dueDate.getTime() + GRACE_DAYS * DAY) : null;
}

export async function getBillingState(userId: string, role?: string): Promise<BillingState> {
    const subscription = await prisma.subscription.findUnique({
        where: { userId },
        include: { plan: true },
    });

    const base = {
        subscription,
        plan: subscription?.plan ?? null,
        maxSessions: subscription?.plan.maxSessions ?? 0,
    };

    if (role === "SUPERADMIN") {
        return { ...base, isActive: true, reason: "superadmin", maxSessions: Infinity, deadline: null, daysLeft: null };
    }
    if (!subscription) {
        return { ...base, isActive: false, reason: "no_subscription", deadline: null, daysLeft: null };
    }

    const now = Date.now();
    switch (subscription.status) {
        case "TRIALING": {
            const end = subscription.trialEndsAt;
            const active = !!end && end.getTime() > now;
            return { ...base, isActive: active, reason: active ? "trial" : "trial_expired", deadline: end, daysLeft: daysUntil(end) };
        }
        case "ACTIVE":
            return { ...base, isActive: true, reason: "active", deadline: subscription.currentPeriodEnd, daysLeft: daysUntil(subscription.currentPeriodEnd) };
        case "PAST_DUE": {
            const end = await graceDeadline(subscription.id);
            const active = !!end && end.getTime() > now;
            return { ...base, isActive: active, reason: active ? "grace" : "past_due", deadline: end, daysLeft: daysUntil(end) };
        }
        case "CANCELED": {
            const end = subscription.currentPeriodEnd;
            const active = !!end && end.getTime() > now;
            return { ...base, isActive: active, reason: "canceled", deadline: end, daysLeft: daysUntil(end) };
        }
        default:
            return { ...base, isActive: false, reason: "expired", deadline: null, daysLeft: null };
    }
}

export async function assertActive(userId: string, role?: string) {
    const state = await getBillingState(userId, role);
    if (!state.isActive) {
        throw new BillingError("SUBSCRIPTION_INACTIVE", "Sua assinatura não está ativa. Escolha um plano para continuar.");
    }
    return state;
}

/** Bloqueia ações numa sessão quando o DONO dela está sem assinatura ativa. */
export async function assertSessionOwnerActive(sessionId: string) {
    const session = await prisma.session.findFirst({
        where: { OR: [{ id: sessionId }, { sessionId }] },
        select: { user: { select: { id: true, role: true } } },
    });
    if (!session) return;
    await assertActive(session.user.id, session.user.role);
}

export async function assertCanCreateSession(userId: string, role?: string) {
    await assertEmailVerified(userId, role);
    const state = await assertActive(userId, role);
    const used = await prisma.session.count({ where: { userId } });
    if (used >= state.maxSessions) {
        throw new BillingError(
            "PLAN_LIMIT",
            `Seu plano permite ${state.maxSessions} WhatsApp(s) conectado(s). Faça upgrade para conectar mais.`
        );
    }
}

export function trialEndDate(from = new Date()) {
    return new Date(from.getTime() + TRIAL_DAYS * DAY);
}

export function addCycle(date: Date, cycle: "MONTHLY" | "YEARLY") {
    const d = new Date(date);
    if (cycle === "YEARLY") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d;
}
