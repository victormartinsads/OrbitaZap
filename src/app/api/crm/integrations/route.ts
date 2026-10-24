import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const configs = await prisma.crmIntegrationConfig.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json({ configs });
    } catch (error) {
        return apiError(error);
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { provider, name, verifyToken, accessToken, targetPipelineId, targetStageId, autoAssignTag } = body;

        if (!provider || !name) {
            return NextResponse.json({ error: "Provedor e Nome são obrigatórios" }, { status: 400 });
        }

        const config = await prisma.crmIntegrationConfig.create({
            data: {
                userId: session.user.id,
                provider,
                name,
                verifyToken,
                accessToken,
                targetPipelineId,
                targetStageId,
                autoAssignTag
            }
        });

        return NextResponse.json({ config });
    } catch (error) {
        return apiError(error);
    }
}

export async function DELETE(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ error: "ID não fornecido" }, { status: 400 });
        }

        await prisma.crmIntegrationConfig.deleteMany({
            where: { id, userId: session.user.id }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return apiError(error);
    }
}
