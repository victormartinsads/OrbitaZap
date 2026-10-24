import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

// Handler GET: Validação do Meta Webhook
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    // Procura uma integração com o verifyToken correspondente
    if (mode === "subscribe" && token) {
        const integration = await prisma.crmIntegrationConfig.findFirst({
            where: {
                provider: "META_ADS",
                verifyToken: token,
                isActive: true
            }
        });

        if (integration) {
            return new Response(challenge, { status: 200 });
        }
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// Handler POST: Recebimento do evento de Leadgen do Meta (Facebook/Instagram)
export async function POST(req: Request) {
    try {
        const body = await req.json();

        // Estrutura padrão do Webhook Meta Lead Ads
        // body.entry[].changes[].value.leadgen_id
        if (body.object === "page" && Array.isArray(body.entry)) {
            for (const entry of body.entry) {
                if (Array.isArray(entry.changes)) {
                    for (const change of entry.changes) {
                        if (change.field === "leadgen") {
                            const value = change.value;
                            const leadgenId = value.leadgen_id;
                            const pageId = value.page_id;
                            const formId = value.form_id;

                            // Localizar integração ativa
                            const integration = await prisma.crmIntegrationConfig.findFirst({
                                where: {
                                    provider: "META_ADS",
                                    isActive: true
                                }
                            });

                            if (!integration) continue;

                            let leadData: any = {
                                name: "Lead Meta Ads",
                                phone: null,
                                email: null,
                                formFields: {}
                            };

                            // Se houver Access Token cadastrado, busca detalhes reais do Lead na Graph API da Meta
                            if (integration.accessToken) {
                                try {
                                    const metaRes = await fetch(
                                        `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${integration.accessToken}`
                                    );
                                    if (metaRes.ok) {
                                        const metaJson = await metaRes.json();
                                        if (Array.isArray(metaJson.field_data)) {
                                            for (const field of metaJson.field_data) {
                                                const fieldName = (field.name || "").toLowerCase();
                                                const val = field.values?.[0] || "";

                                                if (fieldName.includes("name") || fieldName.includes("nome")) {
                                                    leadData.name = val;
                                                } else if (fieldName.includes("phone") || fieldName.includes("telefone") || fieldName.includes("whats")) {
                                                    leadData.phone = val;
                                                } else if (fieldName.includes("email")) {
                                                    leadData.email = val;
                                                }
                                                leadData.formFields[field.name] = val;
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error("Erro ao buscar dados na Graph API:", e);
                                }
                            }

                            // Achar etapa de destino
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

                            if (pipelineId && stageId) {
                                const cleanPhone = leadData.phone ? leadData.phone.replace(/\D/g, "") : null;
                                const remoteJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null;

                                await prisma.crmLead.create({
                                    data: {
                                        userId: integration.userId,
                                        pipelineId,
                                        stageId,
                                        name: leadData.name,
                                        phone: cleanPhone,
                                        remoteJid,
                                        email: leadData.email,
                                        source: "META_ADS",
                                        campaignName: value.adgroup_id ? `AdGroup ${value.adgroup_id}` : "Meta Lead Ads",
                                        tags: "Meta Ads,Form Nativo",
                                        customFields: leadData.formFields,
                                        activities: {
                                            create: {
                                                type: "WEBHOOK_IN",
                                                title: "Lead Capturado via Meta Ads",
                                                content: `Formulário ID: ${formId} | Leadgen ID: ${leadgenId}`
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Meta Webhook Error:", error);
        return apiError(error);
    }
}
