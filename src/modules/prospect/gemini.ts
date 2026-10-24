import { logger } from "@/lib/logger";

export type ProspectIntent = "interested" | "question" | "objection" | "not_interested" | "opt_out" | "neutral";

export interface ProspectAIResult {
    reply: string;
    intent: ProspectIntent;
    handoff: boolean;
    summary: string;
}

export interface ProspectAIContext {
    apiKey: string;
    model: string;
    persona: string;
    offerText: string;
    extraRules?: string;
    lead: { name: string; category?: string | null; city?: string | null; website?: string | null; rating?: number | null; reviews?: number | null };
    history: { fromMe: boolean; content: string }[]; // ordem cronológica; a(s) última(s) mensagem(ns) do lead no fim
}

const SCHEMA = {
    type: "object",
    properties: {
        reply: { type: "string", description: "Mensagem a enviar ao lead no WhatsApp (pt-BR). Vazia se não houver nada a dizer." },
        intent: { type: "string", enum: ["interested", "question", "objection", "not_interested", "opt_out", "neutral"], description: "Intenção do lead na última mensagem." },
        handoff: { type: "boolean", description: "true quando o lead está pronto para falar com um humano: pediu preço final/orçamento fechado, quer reunião/ligação, quer contratar ou pediu para falar com uma pessoa." },
        summary: { type: "string", description: "Resumo curto (1-2 frases) do estágio da negociação e do que o lead quer." },
    },
    required: ["reply", "intent", "handoff", "summary"],
    propertyOrdering: ["reply", "intent", "handoff", "summary"],
};

function systemPrompt(ctx: ProspectAIContext): string {
    const l = ctx.lead;
    const leadInfo = [
        `Empresa: ${l.name}`,
        l.category ? `Segmento: ${l.category}` : null,
        l.city ? `Local: ${l.city}` : null,
        l.website ? `Site atual: ${l.website}` : "Site atual: NÃO TEM site (ponto forte da abordagem)",
        l.rating != null ? `Nota no Google: ${l.rating}${l.reviews != null ? ` (${l.reviews} avaliações)` : ""}` : null,
    ].filter(Boolean).join("\n");

    return `Você é ${ctx.persona}, e está prospectando empresas pelo WhatsApp para oferecer criação de sites.
Você enviou a primeira mensagem para este lead e agora conduz a conversa.

## Sua oferta (única fonte de verdade sobre serviços, preços, prazos e portfólio)
${ctx.offerText || "(oferta não configurada: fale de forma genérica sobre criação de sites profissionais e não cite preços)"}

## Dados do lead
${leadInfo}

## Como conversar
- Escreva como uma pessoa no WhatsApp: mensagens curtas (1 a 3 frases), tom cordial e natural, português do Brasil, no máximo 1 emoji.
- Seja consultivo: mostre o benefício para o negócio DELE (aparecer no Google, passar credibilidade, receber pedidos/agendamentos, não depender só do Instagram).
- Faça no máximo uma pergunta por mensagem para qualificar (ex.: se já pensou em ter site, como os clientes o encontram hoje).
- NUNCA invente preços, prazos, descontos ou cases que não estejam na oferta acima. Se não souber, diga que vai confirmar.
- Se perguntarem diretamente se você é um robô/IA, seja honesto: diga que é um assistente virtual da equipe e que uma pessoa pode assumir quando ele quiser.
- Não envie links a menos que o lead peça portfólio/exemplos e haja link na oferta.
- Contorne objeções uma vez com empatia; se o lead insistir que não quer, agradeça e encerre sem pressionar.

## Classificação
- intent "opt_out": pediu para não receber mais mensagens, "sair", "pare", "me tira da lista", reclamou de spam. reply = pedido de desculpas curto confirmando que não vai mais mandar mensagens.
- intent "not_interested": disse que não tem interesse. reply = agradecimento curto, deixando a porta aberta.
- intent "interested" + handoff true: quer orçamento/preço fechado, reunião, ligação, contratar, ou pediu para falar com alguém. reply = confirme com entusiasmo e diga que você (ou alguém da equipe) já vai dar sequência por aqui em instantes.
- intent "question": dúvida sobre o serviço. Responda usando apenas a oferta.
- intent "objection": "tá caro", "já tenho Instagram", "sem tempo"... Contorne.
- intent "neutral": cumprimento, "quem é?", "?", áudio ou mídia. Apresente-se brevemente e retome o assunto.
${ctx.extraRules ? `\n## Regras adicionais do dono\n${ctx.extraRules}\n` : ""}`;
}

export async function generateProspectReply(ctx: ProspectAIContext): Promise<ProspectAIResult> {
    if (!ctx.apiKey) throw new Error("Configure a chave do Gemini em Prospecção → Configurações");

    // Gemini exige alternância user/model começando por "user": junta mensagens consecutivas do mesmo lado.
    const contents: { role: "user" | "model"; parts: { text: string }[] }[] = [];
    for (const m of ctx.history.slice(-30)) {
        const role = m.fromMe ? "model" : "user";
        const last = contents[contents.length - 1];
        if (last && last.role === role) last.parts[0].text += `\n${m.content}`;
        else contents.push({ role, parts: [{ text: m.content }] });
    }
    if (contents[0]?.role === "model") {
        contents.unshift({ role: "user", parts: [{ text: "(início da conversa: você mandou a primeira mensagem)" }] });
    }
    if (!contents.length || contents[contents.length - 1].role !== "user") {
        contents.push({ role: "user", parts: [{ text: "(o lead ainda não respondeu)" }] });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ctx.model || "gemini-flash-latest")}:generateContent`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": ctx.apiKey },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
            contents,
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json",
                responseJsonSchema: SCHEMA,
            },
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        let msg = err;
        try { msg = JSON.parse(err)?.error?.message || err; } catch { /* texto puro */ }
        throw new Error(`Gemini (${res.status}): ${msg}`);
    }
    const data = await res.json();
    const text: string = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
    if (!text) throw new Error(`Gemini retornou resposta vazia (${data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || "sem motivo"})`);

    let parsed: Partial<ProspectAIResult>;
    try {
        parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
        logger.warn("Prospect", "Gemini não retornou JSON válido; usando o texto como resposta");
        return { reply: text, intent: "neutral", handoff: false, summary: "" };
    }
    const intents: ProspectIntent[] = ["interested", "question", "objection", "not_interested", "opt_out", "neutral"];
    return {
        reply: String(parsed.reply || "").trim(),
        intent: intents.includes(parsed.intent as ProspectIntent) ? parsed.intent as ProspectIntent : "neutral",
        handoff: !!parsed.handoff,
        summary: String(parsed.summary || "").trim(),
    };
}
