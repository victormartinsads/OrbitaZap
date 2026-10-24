import { Prisma, type BillingCycle, type Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { waManager } from "@/modules/whatsapp/manager";
import * as asaas from "./asaas";
import { addCycle, getBillingState } from "./access";

export class BillingRequestError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

const PAID_STATUSES = ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"];

function priceFor(plan: Plan, cycle: BillingCycle) {
    return Number(cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly);
}

function todayInSaoPaulo() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

async function getActivePlan(planId: string) {
    const plan = await prisma.plan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) throw new BillingRequestError("Plano não encontrado", 404);
    return plan;
}

async function upsertPayment(subscriptionId: string, p: asaas.AsaasPayment) {
    const paidAt = p.paymentDate || p.clientPaymentDate;
    const data = {
        value: new Prisma.Decimal(p.value),
        status: p.status,
        billingType: p.billingType,
        dueDate: new Date(`${p.dueDate}T12:00:00-03:00`),
        paidAt: paidAt ? new Date(`${paidAt}T12:00:00-03:00`) : null,
        invoiceUrl: p.invoiceUrl ?? null,
    };
    return prisma.payment.upsert({
        where: { asaasPaymentId: p.id },
        update: data,
        create: { ...data, subscriptionId, asaasPaymentId: p.id },
    });
}

async function notify(userId: string, title: string, message: string, type = "INFO") {
    await prisma.notification
        .create({ data: { userId, title, message, type, href: "/dashboard/billing" } })
        .catch(e => logger.error("Billing", "notification failed", e));
}

export async function getPixForPayment(asaasPaymentId: string) {
    try {
        const pix = await asaas.getPixQrCode(asaasPaymentId);
        return { qrCodeImage: `data:image/png;base64,${pix.encodedImage}`, copyPaste: pix.payload, expiresAt: pix.expirationDate };
    } catch (e) {
        logger.warn("Billing", `Pix QR indisponível para ${asaasPaymentId}: ${e instanceof Error ? e.message : e}`);
        return null;
    }
}

export async function checkout(
    user: { id: string; name: string | null; email: string; role: string },
    input: { planId: string; cycle: BillingCycle; cpfCnpj: string; phone?: string }
) {
    const plan = await getActivePlan(input.planId);
    const state = await getBillingState(user.id, user.role);
    const current = state.subscription;

    if (current?.status === "ACTIVE" && current.asaasSubscriptionId) {
        throw new BillingRequestError("Você já tem uma assinatura ativa. Use a troca de plano.", 409);
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { cpfCnpj: input.cpfCnpj, phone: input.phone || undefined },
    });

    let customerId = current?.asaasCustomerId;
    if (customerId) {
        await asaas.updateCustomer(customerId, { cpfCnpj: input.cpfCnpj, mobilePhone: input.phone || undefined });
    } else {
        const customer = await asaas.createCustomer({
            name: user.name || user.email,
            email: user.email,
            cpfCnpj: input.cpfCnpj,
            mobilePhone: input.phone || undefined,
            externalReference: user.id,
        });
        customerId = customer.id;
    }

    // Um checkout anterior não pago vira cobrança duplicada se não for cancelado.
    if (current?.asaasSubscriptionId) {
        await asaas.cancelSubscription(current.asaasSubscriptionId).catch(e =>
            logger.warn("Billing", `não consegui cancelar assinatura antiga ${current.asaasSubscriptionId}`, e)
        );
    }

    const asaasSub = await asaas.createSubscription({
        customer: customerId,
        value: priceFor(plan, input.cycle),
        cycle: input.cycle,
        nextDueDate: todayInSaoPaulo(),
        description: `Plano ${plan.name} (${input.cycle === "YEARLY" ? "anual" : "mensal"})`,
        externalReference: user.id,
    });

    const subscription = await prisma.subscription.upsert({
        where: { userId: user.id },
        update: {
            asaasCustomerId: customerId,
            asaasSubscriptionId: asaasSub.id,
            pendingPlanId: plan.id,
            cycle: input.cycle,
        },
        create: {
            userId: user.id,
            planId: plan.id,
            status: "EXPIRED",
            cycle: input.cycle,
            asaasCustomerId: customerId,
            asaasSubscriptionId: asaasSub.id,
            pendingPlanId: plan.id,
        },
    });

    let payments: asaas.AsaasPayment[] = [];
    for (let attempt = 0; attempt < 3 && payments.length === 0; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 1000));
        payments = await asaas.listSubscriptionPayments(asaasSub.id);
    }
    const first = payments.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    if (!first) {
        return { invoiceUrl: null, pix: null, value: priceFor(plan, input.cycle), dueDate: null, paymentId: null };
    }

    const payment = await upsertPayment(subscription.id, first);
    return {
        paymentId: payment.asaasPaymentId,
        invoiceUrl: payment.invoiceUrl,
        value: Number(payment.value),
        dueDate: payment.dueDate,
        pix: await getPixForPayment(first.id),
    };
}

export async function changePlan(user: { id: string; role: string }, input: { planId: string; cycle: BillingCycle }) {
    const state = await getBillingState(user.id, user.role);
    const sub = state.subscription;
    if (!sub?.asaasSubscriptionId || !["ACTIVE", "PAST_DUE"].includes(sub.status)) {
        throw new BillingRequestError("Você ainda não tem uma assinatura paga. Faça o checkout.", 409);
    }

    const plan = await getActivePlan(input.planId);
    if (plan.id === sub.planId && input.cycle === sub.cycle && !sub.pendingPlanId) {
        throw new BillingRequestError("Esse já é o seu plano atual.", 409);
    }

    const value = priceFor(plan, input.cycle);
    const isUpgrade = plan.maxSessions > sub.plan.maxSessions;

    if (!isUpgrade) {
        const used = await prisma.session.count({ where: { userId: user.id } });
        if (used > plan.maxSessions) {
            throw new BillingRequestError(
                `Você tem ${used} WhatsApps e o plano ${plan.name} permite ${plan.maxSessions}. Remova alguns antes de trocar.`,
                409
            );
        }
    }

    await asaas.updateSubscription(sub.asaasSubscriptionId, {
        value,
        cycle: input.cycle,
        description: `Plano ${plan.name} (${input.cycle === "YEARLY" ? "anual" : "mensal"})`,
    });

    await prisma.subscription.update({
        where: { id: sub.id },
        data: isUpgrade
            ? { planId: plan.id, cycle: input.cycle, pendingPlanId: null }
            : { pendingPlanId: plan.id === sub.planId ? null : plan.id, cycle: input.cycle },
    });

    return { applied: isUpgrade ? "now" : "next_cycle", plan: plan.id };
}

export async function cancel(user: { id: string; role: string }) {
    const state = await getBillingState(user.id, user.role);
    const sub = state.subscription;
    if (!sub) throw new BillingRequestError("Nenhuma assinatura encontrada.", 404);

    if (sub.asaasSubscriptionId) {
        await asaas.cancelSubscription(sub.asaasSubscriptionId);
    }

    const paid = sub.status === "ACTIVE" || sub.status === "PAST_DUE";
    await prisma.subscription.update({
        where: { id: sub.id },
        data: {
            asaasSubscriptionId: null,
            pendingPlanId: null,
            ...(paid && { status: "CANCELED" }),
        },
    });
    return { activeUntil: paid ? sub.currentPeriodEnd : sub.trialEndsAt };
}

// ---------------- Webhook ----------------

interface AsaasWebhookEvent {
    id: string;
    event: string;
    payment?: asaas.AsaasPayment;
    subscription?: { id: string };
}

async function restartUserSessions(userId: string) {
    const sessions = await prisma.session.findMany({ where: { userId, status: "STOPPED" }, select: { sessionId: true } });
    for (const s of sessions) {
        const hasAuth = await prisma.authState.count({ where: { sessionId: s.sessionId } });
        if (hasAuth) await waManager.startSession(s.sessionId).catch(e => logger.error("Billing", `restart ${s.sessionId}`, e));
    }
}

export async function processWebhookEvent(evt: AsaasWebhookEvent) {
    try {
        await prisma.billingEvent.create({
            data: { id: evt.id, type: evt.event, payload: evt as unknown as Prisma.InputJsonValue },
        });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return "duplicate";
        throw e;
    }

    const asaasSubId = evt.payment?.subscription ?? evt.subscription?.id;
    if (!asaasSubId) return "ignored";

    // Só pela assinatura atual: eventos de checkouts antigos já cancelados não mexem no estado.
    const sub = await prisma.subscription.findUnique({ where: { asaasSubscriptionId: asaasSubId } });
    if (!sub) return "unknown_subscription";

    if (evt.payment) await upsertPayment(sub.id, evt.payment);

    switch (evt.event) {
        case "PAYMENT_RECEIVED":
        case "PAYMENT_CONFIRMED": {
            const p = evt.payment!;
            if (!PAID_STATUSES.includes(p.status)) break;
            const wasActive = (await getBillingState(sub.userId)).isActive;
            const periodEnd = addCycle(new Date(`${p.dueDate}T12:00:00-03:00`), sub.cycle);
            // Pagar uma fatura antiga depois de uma mais nova não pode encurtar o período.
            const currentPeriodEnd = sub.currentPeriodEnd && sub.currentPeriodEnd > periodEnd ? sub.currentPeriodEnd : periodEnd;
            await prisma.subscription.update({
                where: { id: sub.id },
                data: {
                    status: "ACTIVE",
                    planId: sub.pendingPlanId ?? sub.planId,
                    pendingPlanId: null,
                    currentPeriodEnd,
                },
            });
            if (sub.status !== "ACTIVE") {
                await notify(sub.userId, "Pagamento confirmado", "Sua assinatura está ativa. Obrigado!", "SUCCESS");
            }
            if (!wasActive) await restartUserSessions(sub.userId);
            break;
        }
        case "PAYMENT_OVERDUE":
            if (sub.status === "ACTIVE") {
                await prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
                await notify(sub.userId, "Pagamento em atraso", "Sua fatura venceu. Regularize para não perder o acesso.", "WARNING");
            }
            break;
        case "PAYMENT_REFUNDED":
        case "PAYMENT_CHARGEBACK_REQUESTED":
            if (sub.status === "ACTIVE") {
                await prisma.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
            }
            break;
        case "SUBSCRIPTION_DELETED":
        case "SUBSCRIPTION_INACTIVATED":
            await prisma.subscription.update({
                where: { id: sub.id },
                data: { asaasSubscriptionId: null, ...(sub.status === "ACTIVE" || sub.status === "PAST_DUE" ? { status: "CANCELED" } : {}) },
            });
            break;
    }
    return "processed";
}
