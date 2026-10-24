import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/tokens";
import { appUrl } from "@/lib/email";

export async function GET(req: NextRequest) {
    const token = req.nextUrl.searchParams.get("token") ?? "";
    const userId = token ? await consumeAuthToken(token, "EMAIL_VERIFY") : null;

    if (!userId) {
        return NextResponse.redirect(appUrl("/auth/login?verify_error=1"));
    }

    await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    return NextResponse.redirect(appUrl("/dashboard?verified=1"));
}
