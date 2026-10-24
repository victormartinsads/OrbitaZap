import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendFirstContactToLead } from "@/modules/prospect/crm-trigger";
import { apiError } from "@/lib/api-error";
import { findOwnedStage, invalidStageResponse } from "@/lib/crm-ownership";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { leadIds, targetStageId } = body;

        if (!Array.isArray(leadIds) || leadIds.length === 0) {
            return NextResponse.json({ error: "Nenhum lead fornecido." }, { status: 400 });
        }

        if (!targetStageId) {
            return NextResponse.json({ error: "Etapa de destino obrigatória." }, { status: 400 });
        }

        const targetStage = await findOwnedStage(session.user.id, targetStageId);
        if (!targetStage) return invalidStageResponse();

        const isFirstContactStage = targetStage.autoFirstContact === true;

        const results = [];
        let dispatchedCount = 0;

        for (const leadId of leadIds) {
            const currentLead = await prisma.crmLead.findFirst({
                where: { id: leadId, userId: session.user.id, pipelineId: targetStage.pipelineId },
                include: { stage: true },
            });

            if (!currentLead) continue;

            // Atualiza etapa do lead
            await prisma.crmLead.update({
                where: { id: leadId },
                data: {
                    stageId: targetStageId,
                    activities: {
                        create: {
                            userId: session.user.id,
                            type: "STAGE_CHANGE",
                            title: "Etapa alterada em lote",
                            content: `Movido de "${currentLead.stage.name}" para "${targetStage.name}"`,
                        },
                    },
                },
            });

            // Se moveu para "Primeiro Contato", envia a mensagem automática
            if (isFirstContactStage) {
                const res = await sendFirstContactToLead(session.user.id, leadId);
                if (res.success) dispatchedCount++;
                results.push({ leadId, name: currentLead.name, ...res });
            } else {
                results.push({ leadId, name: currentLead.name, success: true });
            }
        }

        return NextResponse.json({
            success: true,
            totalMoved: leadIds.length,
            dispatchedCount,
            isFirstContactStage,
            results,
        });
    } catch (error) {
        return apiError(error);
    }
}
