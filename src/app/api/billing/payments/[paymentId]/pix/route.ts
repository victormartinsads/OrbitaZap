import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";
import { getPixForPayment } from "@/lib/billing/service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { paymentId } = await params;
        const payment = await prisma.payment.findFirst({
            where: { asaasPaymentId: paymentId, subscription: { userId: user.id } },
        });
        if (!payment) return NextResponse.json({ error: "Fatura não encontrada" }, { status: 404 });

        return NextResponse.json({ pix: await getPixForPayment(paymentId), invoiceUrl: payment.invoiceUrl });
    } catch (error) {
        return apiError(error);
    }
}
