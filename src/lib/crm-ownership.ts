import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** A etapa precisa existir, pertencer a um funil do usuário e (se informado) ao funil indicado. */
export async function findOwnedStage(userId: string, stageId: string, pipelineId?: string | null) {
    const stage = await prisma.crmPipelineStage.findFirst({
        where: { id: stageId, pipeline: { userId } },
    });
    if (!stage || (pipelineId && stage.pipelineId !== pipelineId)) return null;
    return stage;
}

export const invalidStageResponse = () =>
    NextResponse.json({ error: "Etapa ou funil inválido" }, { status: 403 });
