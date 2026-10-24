import { NextResponse } from "next/server";

export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "";
}

export function apiError(error: unknown, status = 500): NextResponse {
    const isProd = process.env.NODE_ENV === "production";
    const message = isProd
        ? "Internal server error"
        : error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
}
