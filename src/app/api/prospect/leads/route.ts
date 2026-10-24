import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const campaignId = searchParams.get("campaignId");
        const search = searchParams.get("search");

        const where: any = { userId: session.user.id };
        if (status) where.status = status;
        if (campaignId) where.campaignId = campaignId;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
                { city: { contains: search, mode: "insensitive" } },
                { category: { contains: search, mode: "insensitive" } },
            ];
        }

        const leads = await prisma.prospectLead.findMany({
            where,
            include: {
                campaign: { select: { id: true, name: true } },
                messages: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
            },
            orderBy: [{ unread: "desc" }, { lastInboundAt: "desc" }, { createdAt: "desc" }],
            take: 200,
        });

        // Contadores rápidos por status para o painel
        const counts = await prisma.prospectLead.groupBy({
            by: ["status"],
            where: { userId: session.user.id },
            _count: { _all: true },
        });

        const statusCounts: Record<string, number> = {};
        for (const c of counts) {
            statusCounts[c.status] = c._count._all;
        }

        return NextResponse.json({ leads, statusCounts });
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
        const { leads, campaignId, defaultCity, defaultCategory, sendToCrm = true } = body;

        if (!Array.isArray(leads) || leads.length === 0) {
            return NextResponse.json({ error: "Nenhum lead fornecido." }, { status: 400 });
        }

        let savedCount = 0;
        let skippedCount = 0;

        for (const item of leads) {
            const rawPhone = String(item.phone || "").replace(/\D/g, "");
            if (!rawPhone || rawPhone.length < 10) {
                skippedCount++;
                continue;
            }

            // Normaliza com DDI 55 se vier sem
            const phone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;

            try {
                await prisma.prospectLead.upsert({
                    where: {
                        userId_phone: {
                            userId: session.user.id,
                            phone,
                        },
                    },
                    create: {
                        userId: session.user.id,
                        campaignId: campaignId || null,
                        name: item.name || "Empresa",
                        phone,
                        city: item.city || defaultCity || null,
                        category: item.category || defaultCategory || null,
                        address: item.address || null,
                        website: item.website || null,
                        rating: item.rating ? Number(item.rating) : null,
                        reviews: item.reviews ? Number(item.reviews) : null,
                        mapsUrl: item.mapsUrl || null,
                        placeId: item.placeId || null,
                        source: item.source || "MAPS",
                        status: "NEW",
                    },
                    update: {
                        campaignId: campaignId || undefined,
                        name: item.name || undefined,
                        city: item.city || undefined,
                        category: item.category || undefined,
                        website: item.website || undefined,
                    },
                });
                savedCount++;

                // Envia automaticamente para a 1ª etapa do Funil Comercial do usuário
                if (sendToCrm) {
                    try {
                        let pipeline = await prisma.crmPipeline.findFirst({
                            where: { userId: session.user.id, isDefault: true },
                            include: { stages: { orderBy: { order: "asc" } } },
                        });
                        if (!pipeline) {
                            pipeline = await prisma.crmPipeline.findFirst({
                                where: { userId: session.user.id },
                                include: { stages: { orderBy: { order: "asc" } } },
                            });
                        }
                        const firstStage = pipeline?.stages[0];
                        if (pipeline && firstStage) {
                            const existingCrmLead = await prisma.crmLead.findFirst({
                                where: { userId: session.user.id, phone },
                            });
                            if (!existingCrmLead) {
                                await prisma.crmLead.create({
                                    data: {
                                        userId: session.user.id,
                                        pipelineId: pipeline.id,
                                        stageId: firstStage.id,
                                        name: item.name || "Empresa",
                                        phone,
                                        remoteJid: `${phone}@s.whatsapp.net`,
                                        company: item.name || null,
                                        source: "GOOGLE_MAPS",
                                        email: item.email || null,
                                        customFields: {
                                            city: item.city || defaultCity || null,
                                            category: item.category || defaultCategory || null,
                                            website: item.website || null,
                                            instagram: item.instagram || null,
                                            facebook: item.facebook || null,
                                            linkedin: item.linkedin || null,
                                            email: item.email || null,
                                            address: item.address || null,
                                            rating: item.rating || null,
                                            reviews: item.reviews || null,
                                            mapsUrl: item.mapsUrl || null,
                                            placeId: item.placeId || null,
                                        },
                                        activities: {
                                            create: {
                                                userId: session.user.id,
                                                type: "LEAD_CREATED",
                                                title: "Lead extraído do Google Maps",
                                                content: `Empresa extraída via busca no Maps para a etapa ${firstStage.name}.`,
                                            },
                                        },
                                    },
                                });
                            }
                        }
                    } catch (crmErr) {
                        // Não interrompe o fluxo principal se o CRM falhar
                    }
                }
            } catch {
                skippedCount++;
            }
        }

        return NextResponse.json({
            success: true,
            savedCount,
            skippedCount,
        });
    } catch (error) {
        return apiError(error);
    }
}
