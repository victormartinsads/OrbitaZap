import { NextResponse } from "next/server";
import { BillingError } from "@/lib/billing/access";

export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "";
}

export function apiError(error: unknown, status = 500): NextResponse {
    if (error instanceof BillingError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const isProd = process.env.NODE_ENV === "production";
    const message = isProd
        ? "Internal server error"
        : error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
}
