import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const token = searchParams.get("token");

        if (!token) {
            return NextResponse.json({ error: "Token de webhook não fornecido" }, { status: 400 });
        }

        const integration = await prisma.crmIntegrationConfig.findFirst({
            where: {
                webhookToken: token,
                isActive: true
            }
        });

        if (!integration) {
            return NextResponse.json({ error: "Webhook não encontrado ou inativo" }, { status: 404 });
        }

        const body = await req.json();

        // Extrai campos com suporte a múltiplos formatos
        const name = body.name || body.nome || body.customer_name || body.client_name || "Novo Lead Webhook";
        const phone = body.phone || body.telefone || body.whatsapp || body.celular || body.mobile || null;
        const email = body.email || body.mail || null;
        const company = body.company || body.empresa || null;
        const value = body.value || body.valor || body.amount || body.total || 0;
        const source = body.source || body.origem || integration.name || "WEBHOOK";

        let pipelineId = integration.targetPipelineId;
        let stageId = integration.targetStageId;

        if (!pipelineId || !stageId) {
            const defaultPipeline = await prisma.crmPipeline.findFirst({
                where: { userId: integration.userId },
                include: { stages: { orderBy: { order: "asc" }, take: 1 } }
            });
            if (defaultPipeline && defaultPipeline.stages.length > 0) {
                pipelineId = defaultPipeline.id;
                stageId = defaultPipeline.stages[0].id;
            }
        }

        if (!pipelineId || !stageId) {
            return NextResponse.json({ error: "Nenhum funil ou etapa configurada" }, { status: 400 });
        }

        const cleanPhone = phone ? String(phone).replace(/\D/g, "") : null;
        const remoteJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null;

        const lead = await prisma.crmLead.create({
            data: {
                userId: integration.userId,
                pipelineId,
                stageId,
                name: String(name),
                phone: cleanPhone,
                remoteJid,
                email: email ? String(email) : null,
                company: company ? String(company) : null,
                value: parseFloat(String(value)) || 0.00,
                source: String(source),
                tags: integration.autoAssignTag || "Webhook",
                customFields: body,
                activities: {
                    create: {
                        type: "WEBHOOK_IN",
                        title: `Lead capturado via Webhook (${integration.name})`,
                        content: `Payload recebido e processado com sucesso.`
                    }
                }
            }
        });

        return NextResponse.json({ success: true, leadId: lead.id });
    } catch (error: any) {
        console.error("CRM Webhook Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
