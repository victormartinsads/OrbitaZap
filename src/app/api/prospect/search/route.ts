import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchPlaces } from "@/modules/prospect/maps";
import { scrapeGoogleMaps } from "@/modules/prospect/scraper";
import { apiError } from "@/lib/api-error";

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
        }

        const body = await req.json();
        const { query, niche, city, onlyWithoutWebsite = true, maxResults = 30, useDeepScraper = true } = body;

        const config = await prisma.prospectConfig.findUnique({
            where: { userId: session.user.id },
            select: { mapsApiKey: true },
        });

        const mapsKey = body.apiKey || config?.mapsApiKey;
        const targetCity = (city || "").trim();
        const targetNiche = (niche || "").trim();
        const searchQuery = query || `${targetNiche} em ${targetCity}`.trim();

        if (!searchQuery) {
            return NextResponse.json({ error: "Informe o nicho e a cidade ou uma busca." }, { status: 400 });
        }

        let places: any[] = [];

        // 1. Se o usuário tem chave oficial do Google Places API:
        if (mapsKey && !useDeepScraper) {
            places = await searchPlaces({
                apiKey: mapsKey,
                query: searchQuery,
                niche: targetNiche,
                city: targetCity,
                maxResults: Number(maxResults) || 40,
            });
        } else {
            // 2. Modo Nativo Sem API (Default): usa o Microsoft Edge local para raspar o Google Maps REAL
            // Passamos cityFilter para garantir que NÃO venham empresas de outros estados ou cidades!
            places = await scrapeGoogleMaps({
                query: searchQuery,
                cityFilter: targetCity,
                maxResults: Number(maxResults) || 25,
                enrichSites: true,
            });
        }

        // Filtra empresas sem site se solicitado
        let filtered = places;
        if (onlyWithoutWebsite) {
            filtered = places.filter((p) => !p.website || !p.website.trim());
        }

        // Verifica quais telefones já estão cadastrados para este usuário
        const phonesToCheck = filtered.map((p) => p.phone).filter(Boolean) as string[];
        const existingPhones = new Set(
            phonesToCheck.length > 0
                ? (
                      await prisma.prospectLead.findMany({
                          where: {
                              userId: session.user.id,
                              phone: { in: phonesToCheck },
                          },
                          select: { phone: true },
                      })
                  ).map((l) => l.phone)
                : []
        );

        const results = filtered.map((p) => ({
            ...p,
            alreadySaved: p.phone ? existingPhones.has(p.phone) : false,
        }));

        return NextResponse.json({
            query: searchQuery,
            city: targetCity,
            totalFound: places.length,
            scraperMode: mapsKey && !useDeepScraper ? "OFFICIAL_API" : "NATIVE_EDGE_SCRAPER",
            results,
        });
    } catch (error) {
        return apiError(error);
    }
}
