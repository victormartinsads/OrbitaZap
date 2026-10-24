import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";
import { hit, MINUTE } from "@/lib/rate-limit";

async function findIntegration(req: Request) {
    const token = new URL(req.url).searchParams.get("token");
    if (!token) return null;
    return prisma.crmIntegrationConfig.findFirst({
        where: { webhookToken: token, provider: "META_ADS", isActive: true },
    });
}

function validSignature(rawBody: string, header: string | null, appSecret: string) {
    if (!header?.startsWith("sha256=")) return false;
    const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
    const received = Buffer.from(header.slice("sha256=".length));
    return expected.length === received.length && timingSafeEqual(expected, received);
}

// Handshake de verificação do Meta Developers
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const integration = await findIntegration(req);

    if (
        integration?.verifyToken &&
        searchParams.get("hub.mode") === "subscribe" &&
        searchParams.get("hub.verify_token") === integration.verifyToken
    ) {
        return new Response(searchParams.get("hub.challenge"), { status: 200 });
    }
    return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// Eventos de Leadgen do Meta (Facebook/Instagram)
export async function POST(req: Request) {
    try {
        const integration = await findIntegration(req);
        if (!integration) {
            return NextResponse.json({ error: "Integração não encontrada ou inativa" }, { status: 404 });
        }
        if (!hit(`crm-webhook:${integration.webhookToken}`, 120, MINUTE).allowed) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }

        const rawBody = await req.text();
        if (integration.appSecret && !validSignature(rawBody, req.headers.get("x-hub-signature-256"), integration.appSecret)) {
            return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
        }

        let body: any;
        try {
            body = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }

        if (body.object !== "page" || !Array.isArray(body.entry)) {
            return NextResponse.json({ success: true });
        }

        for (const entry of body.entry) {
            if (!Array.isArray(entry.changes)) continue;
            for (const change of entry.changes) {
                if (change.field !== "leadgen") continue;

                const value = change.value ?? {};
                const leadgenId = String(value.leadgen_id ?? "");
                const formId = value.form_id;
                if (!/^\d+$/.test(leadgenId)) continue;

                const leadData: { name: string; phone: string | null; email: string | null; formFields: Record<string, string> } = {
                    name: "Lead Meta Ads",
                    phone: null,
                    email: null,
                    formFields: {},
                };

                if (integration.accessToken) {
                    try {
                        const metaRes = await fetch(
                            `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${encodeURIComponent(integration.accessToken)}`
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

                if (!pipelineId || !stageId) continue;

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

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Meta Webhook Error:", error);
        return apiError(error);
    }
}
