import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateApiKey } from "@/lib/api-auth";
import { sha256 } from "@/lib/tokens";

// Only the hash is stored, so the key itself can never be read back.
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { apiKey: true, apiKeyPrefix: true }
        });

        return NextResponse.json({ status: true, message: "API key fetched", data: { hasKey: !!user?.apiKey, prefix: user?.apiKeyPrefix ?? null } });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to fetch API key", error: "Failed to fetch API key" }, { status: 500 });
    }
}

// Generates a new key and returns it this one time
export async function POST() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        const newApiKey = generateApiKey();
        const prefix = newApiKey.slice(0, 8);

        await prisma.user.update({
            where: { id: session.user.id },
            data: { apiKey: sha256(newApiKey), apiKeyPrefix: prefix }
        });

        return NextResponse.json({ status: true, message: "API key generated", data: { apiKey: newApiKey, prefix } });
    } catch (error) {
        console.error("Generate API key error:", error);
        return NextResponse.json({ status: false, message: "Failed to generate API key", error: "Failed to generate API key" }, { status: 500 });
    }
}

export async function DELETE() {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ status: false, message: "Unauthorized", error: "Unauthorized" }, { status: 401 });

    try {
        await prisma.user.update({
            where: { id: session.user.id },
            data: { apiKey: null, apiKeyPrefix: null }
        });

        return NextResponse.json({ status: true, message: "API key revoked" });
    } catch (error) {
        return NextResponse.json({ status: false, message: "Failed to revoke API key", error: "Failed to revoke API key" }, { status: 500 });
    }
}
