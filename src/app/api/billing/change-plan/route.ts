import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { apiError } from "@/lib/api-error";
import { billingChangePlanSchema } from "@/lib/validations";
import { AsaasError } from "@/lib/billing/asaas";
import { BillingRequestError, changePlan } from "@/lib/billing/service";

export async function POST(req: NextRequest) {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user || user.authMethod !== "session") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsed = billingChangePlanSchema.safeParse(await req.json());
        if (!parsed.success) {
            return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
        }

        return NextResponse.json(await changePlan(user, parsed.data));
    } catch (error) {
        if (error instanceof BillingRequestError || error instanceof AsaasError) {
            return NextResponse.json({ error: error.message }, { status: error.status >= 500 ? 502 : error.status });
        }
        return apiError(error);
    }
}
