import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";
import { findOwnedStage, invalidStageResponse } from "@/lib/crm-ownership";

const PROVIDERS = ["META_ADS", "GOOGLE_SHEETS", "WEBHOOK"];

// Secrets stay on the server; the UI only needs to know whether they are set.
function withoutSecrets<T extends { accessToken: string | null; appSecret: string | null }>({ accessToken, appSecret, ...rest }: T) {
    return { ...rest, hasAccessToken: !!accessToken, hasAppSecret: !!appSecret };
}

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const configs = await prisma.crmIntegrationConfig.findMany({
            where: { userId: session.user.id },
            orderBy: { createdAt: "desc" },
        });

        return NextResponse.json({ configs: configs.map(withoutSecrets) });
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
        const { provider, name, verifyToken, accessToken, appSecret, targetPipelineId, targetStageId, autoAssignTag } = body;

        if (!PROVIDERS.includes(provider) || !name) {
            return NextResponse.json({ error: "Provedor inválido ou nome ausente" }, { status: 400 });
        }
        if (provider === "META_ADS" && !verifyToken) {
            return NextResponse.json({ error: "Informe o Verify Token da Meta" }, { status: 400 });
        }
        if (targetStageId && !(await findOwnedStage(session.user.id, targetStageId, targetPipelineId))) {
            return invalidStageResponse();
        }
        if (targetPipelineId && !targetStageId) {
            const pipeline = await prisma.crmPipeline.findFirst({ where: { id: targetPipelineId, userId: session.user.id } });
            if (!pipeline) return invalidStageResponse();
        }

        const config = await prisma.crmIntegrationConfig.create({
            data: {
                userId: session.user.id,
                provider,
                name,
                verifyToken: verifyToken || null,
                accessToken: accessToken || null,
                appSecret: appSecret || null,
                targetPipelineId: targetPipelineId || null,
                targetStageId: targetStageId || null,
                autoAssignTag
            },
        });

        return NextResponse.json({ config: withoutSecrets(config) });
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
