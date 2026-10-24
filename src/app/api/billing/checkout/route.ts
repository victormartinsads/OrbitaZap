import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";
import { billingCheckoutSchema } from "@/lib/validations";
import { AsaasError } from "@/lib/billing/asaas";
import { BillingRequestError, checkout } from "@/lib/billing/service";
import { assertEmailVerified } from "@/lib/billing/access";

export async function POST(req: NextRequest) {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user || user.authMethod !== "session") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
            await assertEmailVerified(user.id, user.role);
        } catch (e) {
            return apiError(e);
        }

        const parsed = billingCheckoutSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
        }

        return NextResponse.json(await checkout(user, parsed.data));
    } catch (error) {
        if (error instanceof BillingRequestError || error instanceof AsaasError) {
            return NextResponse.json({ error: error.message }, { status: error.status >= 500 ? 502 : error.status });
        }
        return apiError(error);
    }
}
