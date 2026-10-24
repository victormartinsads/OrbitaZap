import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";
import { hit, HOUR } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/account";

export async function POST() {
    try {
        const session = await auth();
        if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { id: true, name: true, email: true, emailVerifiedAt: true },
        });
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        if (user.emailVerifiedAt) return NextResponse.json({ alreadyVerified: true });

        if (!hit(`resend-verify:${user.id}`, 3, HOUR).allowed) {
            return NextResponse.json({ error: "Você já pediu vários e-mails. Tente de novo em uma hora." }, { status: 429 });
        }

        await sendVerificationEmail(user);
        return NextResponse.json({ sent: true, email: user.email });
    } catch (error) {
        return apiError(error);
    }
}
