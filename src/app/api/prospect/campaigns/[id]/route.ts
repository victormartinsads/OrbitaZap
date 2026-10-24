import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { controlProspectCampaign } from "@/modules/prospect/runner";
import { apiError } from "@/lib/api-error";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { id } = await params;
        const campaign = await prisma.prospectCampaign.findFirst({
            where: { id, userId: session.user.id },
            include: {
                leads: {
                    take: 50,
                    orderBy: { createdAt: "desc" },
                },
                _count: {
                    select: { leads: true },
                },
            },
        });

        if (!campaign) {
            return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
        }

        return NextResponse.json({ campaign });
    } catch (error) {
        return apiError(error);
    }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { action } = body; // "start", "pause", "reset"

        if (!action || !["start", "pause", "reset"].includes(action)) {
            return NextResponse.json({ error: "Ação inválida (start, pause, reset)" }, { status: 400 });
        }

        const campaign = await prisma.prospectCampaign.findFirst({
            where: { id, userId: session.user.id },
        });

        if (!campaign) {
            return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
        }

        const result = await controlProspectCampaign(id, action);
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        return apiError(error);
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { id } = await params;

        await prisma.prospectCampaign.delete({
            where: { id, userId: session.user.id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return apiError(error);
    }
}
