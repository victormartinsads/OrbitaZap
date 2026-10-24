import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { logger } from "@/lib/logger";
import { processWebhookEvent } from "@/lib/billing/service";

function validToken(received: string | null) {
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expected || !received) return false;
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
    if (!validToken(req.headers.get("asaas-access-token"))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const evt = await req.json().catch(() => null);
    if (!evt?.id || !evt?.event) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    try {
        const result = await processWebhookEvent(evt);
        logger.info("Billing", `webhook ${evt.event} ${evt.id}: ${result}`);
        return NextResponse.json({ received: true, result });
    } catch (error) {
        logger.error("Billing", `webhook ${evt.event} ${evt.id} failed`, error);
        return NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
}
