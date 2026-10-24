import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";
import { getBillingState } from "@/lib/billing/access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const [state, plans, usedSessions, profile] = await Promise.all([
            getBillingState(user.id, user.role),
            prisma.plan.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
            prisma.session.count({ where: { userId: user.id } }),
            prisma.user.findUnique({ where: { id: user.id }, select: { cpfCnpj: true, phone: true } }),
        ]);

        const sub = state.subscription;
        const payments = sub
            ? await prisma.payment.findMany({ where: { subscriptionId: sub.id }, orderBy: { dueDate: "desc" }, take: 12 })
            : [];
        const openPayment = sub?.asaasSubscriptionId
            ? payments.find(p => ["PENDING", "OVERDUE"].includes(p.status))
            : undefined;

        return NextResponse.json({
            isActive: state.isActive,
            reason: state.reason,
            deadline: state.deadline,
            daysLeft: state.daysLeft,
            usedSessions,
            maxSessions: Number.isFinite(state.maxSessions) ? state.maxSessions : null,
            subscription: sub && {
                status: sub.status,
                cycle: sub.cycle,
                planId: sub.planId,
                planName: sub.plan.name,
                pendingPlanId: sub.pendingPlanId,
                trialEndsAt: sub.trialEndsAt,
                currentPeriodEnd: sub.currentPeriodEnd,
                hasPaidSubscription: !!sub.asaasSubscriptionId && ["ACTIVE", "PAST_DUE"].includes(sub.status),
            },
            openPayment: openPayment && {
                id: openPayment.asaasPaymentId,
                value: Number(openPayment.value),
                dueDate: openPayment.dueDate,
                status: openPayment.status,
                invoiceUrl: openPayment.invoiceUrl,
            },
            payments: payments.map(p => ({
                id: p.asaasPaymentId,
                value: Number(p.value),
                status: p.status,
                billingType: p.billingType,
                dueDate: p.dueDate,
                paidAt: p.paidAt,
                invoiceUrl: p.invoiceUrl,
            })),
            plans: plans.map(p => ({
                id: p.id,
                name: p.name,
                priceMonthly: Number(p.priceMonthly),
                priceYearly: Number(p.priceYearly),
                maxSessions: p.maxSessions,
            })),
            profile,
        });
    } catch (error) {
        return apiError(error);
    }
}
