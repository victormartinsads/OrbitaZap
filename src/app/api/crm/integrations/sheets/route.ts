import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";
import { hit, MINUTE } from "@/lib/rate-limit";

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
                provider: "GOOGLE_SHEETS",
                isActive: true
            }
        });

        if (!integration) {
            return NextResponse.json({ error: "Integração do Google Sheets não encontrada ou inativa" }, { status: 404 });
        }
        if (!hit(`crm-webhook:${token}`, 120, MINUTE).allowed) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }

        const body = await req.json();

        // Mapeamento flexível de dados comuns de planilha
        const name = body.nome || body.name || body.Nome || body.Name || "Lead Google Sheets";
        const phone = body.telefone || body.phone || body.Telefone || body.Phone || body.whatsapp || body.WhatsApp || null;
        const email = body.email || body.Email || body.e_mail || null;
        const company = body.empresa || body.company || body.Empresa || null;
        const value = body.valor || body.value || body.Valor || 0;

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
                source: "GOOGLE_SHEETS",
                tags: integration.autoAssignTag || "Google Sheets",
                customFields: body,
                activities: {
                    create: {
                        type: "WEBHOOK_IN",
                        title: "Lead importado do Google Sheets",
                        content: `Dados sincronizados da planilha via Webhook.`
                    }
                }
            }
        });

        return NextResponse.json({ success: true, leadId: lead.id });
    } catch (error) {
        console.error("Google Sheets Webhook Error:", error);
        return apiError(error);
    }
}
