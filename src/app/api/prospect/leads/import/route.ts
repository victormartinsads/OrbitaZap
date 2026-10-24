import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-error";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const body = await req.json();
        const { rows, campaignId, defaultCity, defaultCategory } = body;

        if (!Array.isArray(rows) || rows.length === 0) {
            return NextResponse.json({ error: "Nenhuma linha enviada para importação." }, { status: 400 });
        }

        let imported = 0;
        let skipped = 0;

        for (const r of rows) {
            const rawPhone = String(r.phone || r.telefone || r.celular || "").replace(/\D/g, "");
            if (!rawPhone || rawPhone.length < 10) {
                skipped++;
                continue;
            }

            const phone = rawPhone.startsWith("55") ? rawPhone : `55${rawPhone}`;
            const name = r.name || r.nome || r.empresa || "Empresa";
            const city = r.city || r.cidade || defaultCity || null;
            const category = r.category || r.nicho || r.segmento || defaultCategory || null;
            const website = r.website || r.site || null;

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
                        name,
                        phone,
                        city,
                        category,
                        website,
                        source: "CSV",
                        status: "NEW",
                    },
                    update: {
                        campaignId: campaignId || undefined,
                        name: name || undefined,
                        city: city || undefined,
                        category: category || undefined,
                    },
                });
                imported++;
            } catch {
                skipped++;
            }
        }

        return NextResponse.json({ success: true, imported, skipped });
    } catch (error) {
        return apiError(error);
    }
}
