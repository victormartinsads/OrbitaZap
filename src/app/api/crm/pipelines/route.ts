import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        // Buscar pipelines do usuário ou criar pipeline padrão se não existir nenhum
        let pipelines = await prisma.crmPipeline.findMany({
            where: { userId },
            include: {
                stages: {
                    orderBy: { order: "asc" }
                }
            },
            orderBy: { createdAt: "asc" }
        });

        if (pipelines.length === 0) {
            const defaultPipeline = await prisma.crmPipeline.create({
                data: {
                    userId,
                    name: "Funil Comercial Padrão",
                    isDefault: true,
                    stages: {
                        create: [
                            { name: "Novo Lead", color: "#3b82f6", order: 0 },
                            { name: "Primeiro Contato", color: "#f59e0b", order: 1 },
                            { name: "Qualificação", color: "#8b5cf6", order: 2 },
                            { name: "Proposta Enviada", color: "#ec4899", order: 3 },
                            { name: "Negociação", color: "#00bfa5", order: 4 },
                            { name: "Ganha", color: "#10b981", order: 5, isWon: true },
                            { name: "Perdida", color: "#ef4444", order: 6, isLost: true },
                        ]
                    }
                },
                include: {
                    stages: {
                        orderBy: { order: "asc" }
                    }
                }
            });
            pipelines = [defaultPipeline];
        }

        return NextResponse.json({ pipelines });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { name, description, stages } = body;

        if (!name) {
            return NextResponse.json({ error: "Nome do funil é obrigatório" }, { status: 400 });
        }

        const pipeline = await prisma.crmPipeline.create({
            data: {
                userId: session.user.id,
                name,
                description,
                stages: {
                    create: (stages && stages.length > 0) ? stages.map((s: any, idx: number) => ({
                        name: s.name,
                        color: s.color || "#00bfa5",
                        order: idx,
                        isWon: Boolean(s.isWon),
                        isLost: Boolean(s.isLost)
                    })) : [
                        { name: "Novo Lead", color: "#3b82f6", order: 0 },
                        { name: "Em Andamento", color: "#f59e0b", order: 1 },
                        { name: "Concluído", color: "#10b981", order: 2, isWon: true }
                    ]
                }
            },
            include: {
                stages: {
                    orderBy: { order: "asc" }
                }
            }
        });

        return NextResponse.json({ pipeline });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
