import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { id } = await params;

        const lead = await prisma.prospectLead.findFirst({
            where: { id, userId: session.user.id },
            include: {
                campaign: true,
                messages: {
                    orderBy: { createdAt: "asc" },
                },
            },
        });

        if (!lead) {
            return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });
        }

        // Zera contagem de não lidas ao abrir a conversa
        if (lead.unread > 0) {
            await prisma.prospectLead.update({
                where: { id: lead.id },
                data: { unread: 0 },
            });
        }

        return NextResponse.json({ lead });
    } catch (error) {
        return apiError(error);
    }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { status, aiPaused, notes } = body;

        const updated = await prisma.prospectLead.update({
            where: { id, userId: session.user.id },
            data: {
                status: status !== undefined ? status : undefined,
                aiPaused: aiPaused !== undefined ? Boolean(aiPaused) : undefined,
            },
        });

        return NextResponse.json({ success: true, lead: updated });
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

        await prisma.prospectLead.delete({
            where: { id, userId: session.user.id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return apiError(error);
    }
}
