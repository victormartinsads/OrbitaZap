import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const campaigns = await prisma.prospectCampaign.findMany({
            where: { userId: session.user.id },
            include: {
                _count: {
                    select: { leads: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        const enriched = await Promise.all(
            campaigns.map(async (c) => {
                const [contacted, conversing, interested, failed] = await Promise.all([
                    prisma.prospectLead.count({ where: { campaignId: c.id, status: "CONTACTED" } }),
                    prisma.prospectLead.count({ where: { campaignId: c.id, status: "CONVERSING" } }),
                    prisma.prospectLead.count({ where: { campaignId: c.id, status: "INTERESTED" } }),
                    prisma.prospectLead.count({ where: { campaignId: c.id, status: { in: ["FAILED", "NO_WHATSAPP"] } } }),
                ]);
                return {
                    ...c,
                    totalLeads: c._count.leads,
                    contacted,
                    conversing,
                    interested,
                    failed,
                };
            })
        );

        return NextResponse.json({ campaigns: enriched });
    } catch (error) {
        return apiError(error);
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const body = await req.json();
        const { name, openingMessage } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: "Nome da campanha é obrigatório." }, { status: 400 });
        }

        const campaign = await prisma.prospectCampaign.create({
            data: {
                userId: session.user.id,
                name: name.trim(),
                openingMessage:
                    openingMessage ||
                    `{Oi|Olá}, {primeiro_nome}! Tudo bem?\nVi a {nome} aqui no Google e achei bem bacana o trabalho de vocês em {cidade}.\n\nNotei que vocês ainda não possuem um site próprio para divulgar os serviços. Vocês já pensaram em criar um para atrair mais clientes?`,
                status: "DRAFT",
            },
        });

        return NextResponse.json({ success: true, campaign });
    } catch (error) {
        return apiError(error);
    }
}
