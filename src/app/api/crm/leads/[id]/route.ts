import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        const lead = await prisma.crmLead.findFirst({
            where: {
                id,
                userId: session.user.id
            },
            include: {
                stage: true,
                pipeline: true,
                activities: {
                    orderBy: { createdAt: "desc" }
                }
            }
        });

        if (!lead) {
            return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
        }

        return NextResponse.json({ lead });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();

        const currentLead = await prisma.crmLead.findFirst({
            where: { id, userId: session.user.id },
            include: { stage: true }
        });

        if (!currentLead) {
            return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
        }

        const updateData: any = {};
        const activitiesToCreate = [];

        if (body.stageId && body.stageId !== currentLead.stageId) {
            updateData.stageId = body.stageId;
            const newStage = await prisma.crmPipelineStage.findUnique({ where: { id: body.stageId } });
            activitiesToCreate.push({
                userId: session.user.id,
                type: "STAGE_CHANGE",
                title: "Etapa alterada",
                content: `Movido de "${currentLead.stage.name}" para "${newStage?.name || body.stageId}"`
            });
        }

        if (body.name !== undefined) updateData.name = body.name;
        if (body.email !== undefined) updateData.email = body.email;
        if (body.company !== undefined) updateData.company = body.company;
        if (body.jobTitle !== undefined) updateData.jobTitle = body.jobTitle;
        if (body.value !== undefined) updateData.value = parseFloat(body.value);
        if (body.priority !== undefined) updateData.priority = body.priority;
        if (body.notes !== undefined) updateData.notes = body.notes;
        if (body.tags !== undefined) updateData.tags = Array.isArray(body.tags) ? body.tags.join(",") : body.tags;
        if (body.customFields !== undefined) updateData.customFields = body.customFields;
        if (body.phone !== undefined) {
            updateData.phone = body.phone ? body.phone.replace(/\D/g, "") : null;
            updateData.remoteJid = updateData.phone ? `${updateData.phone}@s.whatsapp.net` : null;
        }

        if (body.newNote) {
            activitiesToCreate.push({
                userId: session.user.id,
                type: "NOTE",
                title: "Nota interna adicionada",
                content: body.newNote
            });
        }

        const updatedLead = await prisma.crmLead.update({
            where: { id },
            data: {
                ...updateData,
                activities: activitiesToCreate.length > 0 ? {
                    create: activitiesToCreate
                } : undefined
            },
            include: {
                stage: true,
                activities: {
                    orderBy: { createdAt: "desc" }
                }
            }
        });

        return NextResponse.json({ lead: updatedLead });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;

        await prisma.crmLead.deleteMany({
            where: {
                id,
                userId: session.user.id
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
