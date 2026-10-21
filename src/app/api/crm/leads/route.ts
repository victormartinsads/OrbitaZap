import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const pipelineId = searchParams.get("pipelineId");
        const search = searchParams.get("search");

        const whereClause: any = {
            userId: session.user.id
        };

        if (pipelineId) {
            whereClause.pipelineId = pipelineId;
        }

        if (search) {
            whereClause.OR = [
                { name: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } },
                { company: { contains: search } }
            ];
        }

        const leads = await prisma.crmLead.findMany({
            where: whereClause,
            include: {
                stage: true,
                activities: {
                    orderBy: { createdAt: "desc" },
                    take: 5
                }
            },
            orderBy: [{ order: "asc" }, { createdAt: "desc" }]
        });

        return NextResponse.json({ leads });
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
        const {
            pipelineId,
            stageId,
            name,
            phone,
            email,
            company,
            jobTitle,
            value,
            priority,
            source,
            campaignName,
            notes,
            tags,
            customFields
        } = body;

        if (!name || !pipelineId || !stageId) {
            return NextResponse.json({ error: "Nome, funil e etapa são obrigatórios" }, { status: 400 });
        }

        // Sanitizar telefone e criar remoteJid se fornecido
        let cleanPhone = phone ? phone.replace(/\D/g, "") : null;
        let remoteJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null;

        const lead = await prisma.crmLead.create({
            data: {
                userId: session.user.id,
                pipelineId,
                stageId,
                name,
                phone: cleanPhone,
                remoteJid,
                email,
                company,
                jobTitle,
                value: value ? parseFloat(value) : 0.00,
                priority: priority || "MEDIUM",
                source: source || "MANUAL",
                campaignName,
                notes,
                tags: Array.isArray(tags) ? tags.join(",") : tags,
                customFields: customFields || null,
                activities: {
                    create: {
                        userId: session.user.id,
                        type: "LEAD_CREATED",
                        title: "Lead cadastrado",
                        content: `Lead adicionado manualmente na etapa.`
                    }
                }
            },
            include: {
                stage: true,
                activities: true
            }
        });

        return NextResponse.json({ lead });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
