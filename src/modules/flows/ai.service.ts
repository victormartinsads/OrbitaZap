import { logger } from "@/lib/logger";

export interface AIServiceConfig {
    provider: "openai" | "gemini";
    apiKey?: string;
    model?: string;
    systemPrompt: string;
    temperature?: number;
}

export interface AIChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export class AIService {
    /**
     * Gera resposta com OpenAI (GPT-4o, GPT-4o-mini, etc.)
     */
    private static async runOpenAI(
        apiKey: string,
        model: string,
        messages: AIChatMessage[],
        temperature = 0.7
    ): Promise<string> {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: model || "gpt-4o-mini",
                messages,
                temperature,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenAI API error (${res.status}): ${err}`);
        }

        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || "";
    }

    /**
     * Gera resposta com Google Gemini (gemini-1.5-flash, gemini-2.0-flash, etc.)
     */
    private static async runGemini(
        apiKey: string,
        model: string,
        messages: AIChatMessage[],
        temperature = 0.7
    ): Promise<string> {
        const targetModel = model || "gemini-1.5-flash";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`;

        // Separa system instruction das mensagens de usuário/assistente
        const systemMsg = messages.find((m) => m.role === "system");
        const chatMsgs = messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
                role: m.role === "assistant" ? "model" : "user",
                parts: [{ text: m.content }],
            }));

        const body: any = {
            contents: chatMsgs,
            generationConfig: {
                temperature,
            },
        };

        if (systemMsg?.content) {
            body.systemInstruction = {
                parts: [{ text: systemMsg.content }],
            };
        }

        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini API error (${res.status}): ${err}`);
        }

        const data = await res.json();
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;
        return text?.trim() || "";
    }

    /**
     * Ponto de entrada unificado para IA nos fluxos
     */
    static async generateReply(
        config: AIServiceConfig,
        userMessage: string,
        conversationHistory: AIChatMessage[] = []
    ): Promise<string> {
        // Exige explicitamente a chave do usuário configurada no nó, para evitar consumo indevido de cotas globais
        const apiKey = config.apiKey;

        if (!apiKey || !apiKey.trim()) {
            throw new Error(`Chave de API obrigatória: configure sua chave ${config.provider.toUpperCase()} no bloco de IA do fluxo.`);
        }

        const messages: AIChatMessage[] = [
            { role: "system", content: config.systemPrompt || "Você é um assistente prestativo e educado da empresa no WhatsApp." },
            ...conversationHistory.slice(-6), // Mantém até as últimas 6 mensagens de contexto
            { role: "user", content: userMessage },
        ];

        logger.info("AI", `Gerando resposta via ${config.provider} (${config.model || "padrão"})...`);

        if (config.provider === "gemini") {
            return await this.runGemini(apiKey, config.model || "gemini-1.5-flash", messages, config.temperature);
        } else {
            return await this.runOpenAI(apiKey, config.model || "gpt-4o-mini", messages, config.temperature);
        }
    }
}
