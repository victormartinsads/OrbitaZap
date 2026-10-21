import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { pipelineId, stageId, leads, defaultTag } = body;

        if (!pipelineId || !stageId) {
            return NextResponse.json({ error: "Funil e etapa de destino são obrigatórios" }, { status: 400 });
        }

        if (!Array.isArray(leads) || leads.length === 0) {
            return NextResponse.json({ error: "Nenhum lead fornecido para importação" }, { status: 400 });
        }

        let importedCount = 0;
        let skippedCount = 0;

        // Processa os leads em lote
        for (const item of leads) {
            const rawName = item.name || item.nome || item.Nome || item.Client || "Lead Importado";
            const rawPhone = item.phone || item.telefone || item.whatsapp || item.Telefone || item.Celular || null;
            const rawEmail = item.email || item.Email || null;
            const rawCompany = item.company || item.empresa || item.Empresa || null;
            const rawValue = item.value || item.valor || item.Valor || 0;
            const itemTags = item.tags || defaultTag || "Importação em Massa";

            const cleanPhone = rawPhone ? String(rawPhone).replace(/\D/g, "") : null;
            const remoteJid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : null;

            try {
                await prisma.crmLead.create({
                    data: {
                        userId: session.user.id,
                        pipelineId,
                        stageId,
                        name: String(rawName).trim(),
                        phone: cleanPhone,
                        remoteJid,
                        email: rawEmail ? String(rawEmail).trim() : null,
                        company: rawCompany ? String(rawCompany).trim() : null,
                        value: parseFloat(String(rawValue)) || 0.00,
                        source: "IMPORT_CSV",
                        tags: String(itemTags),
                        customFields: item,
                        activities: {
                            create: {
                                userId: session.user.id,
                                type: "IMPORT",
                                title: "Lead importado em massa",
                                content: `Importado via arquivo CSV/Planilha na etapa.`
                            }
                        }
                    }
                });
                importedCount++;
            } catch (err) {
                skippedCount++;
            }
        }

        return NextResponse.json({
            success: true,
            imported: importedCount,
            skipped: skippedCount,
            total: leads.length
        });
    } catch (error: any) {
        console.error("Bulk Import Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
