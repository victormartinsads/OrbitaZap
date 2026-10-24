import { z } from "zod";
import { isValidCpfCnpj, onlyDigits } from "@/lib/billing/document";

export const createGroupSchema = z.object({
    sessionId: z.string().min(1, "Session ID is required"),
    subject: z.string().min(1, "Group subject is required").max(100, "Subject too long"),
    participants: z.array(z.string().regex(/@s\.whatsapp\.net$/, "Invalid participant JID")).default([]) // empty: the group starts with only the account itself
});

// Message content for Baileys - can be text object or media object
export const messageContentSchema = z.union([
    z.object({ text: z.string() }),
    z.object({ image: z.object({ url: z.string() }), caption: z.string().optional() }),
    z.object({ video: z.object({ url: z.string() }), caption: z.string().optional() }),
    z.object({ document: z.object({ url: z.string() }), mimetype: z.string().optional(), fileName: z.string().optional() }),
]);

export const broadcastSchema = z.object({
    sessionId: z.string().min(1),
    recipients: z.array(z.string()).min(1),
    message: z.string().min(1), // Accept string from frontend, convert to object in API
    delay: z.number().min(500).max(60000).optional().default(2000)
});

export const stickerSchema = z.object({
    sessionId: z.string().min(1),
    jid: z.string().min(1),
    // File validation handled separately as it comes from FormData
});

const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const createLeadSchema = z.object({
    pipelineId:   z.string().min(1, "pipelineId é obrigatório"),
    stageId:      z.string().min(1, "stageId é obrigatório"),
    name:         z.string().min(1, "nome é obrigatório"),
    phone:        z.string().optional(),
    email:        z.string().optional(),
    company:      z.string().optional(),
    jobTitle:     z.string().optional(),
    value:        z.union([z.number(), z.string()]).optional(),
    priority:     priorityEnum.optional().default("MEDIUM"),
    source:       z.string().optional(),
    campaignName: z.string().optional(),
    notes:        z.string().optional(),
    tags:         z.union([z.array(z.string()), z.string()]).optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
});

export const patchLeadSchema = z.object({
    stageId:      z.string().optional(),
    name:         z.string().min(1).optional(),
    phone:        z.string().nullish(),
    email:        z.string().nullish(),
    company:      z.string().nullish(),
    jobTitle:     z.string().nullish(),
    value:        z.union([z.number(), z.string()]).optional(),
    priority:     priorityEnum.optional(),
    notes:        z.string().nullish(),
    tags:         z.union([z.array(z.string()), z.string()]).nullish(),
    customFields: z.record(z.string(), z.unknown()).nullish(),
    newNote:      z.string().optional(),
});

const billingCycleEnum = z.enum(["MONTHLY", "YEARLY"]);

export const billingCheckoutSchema = z.object({
    planId:  z.string().min(1),
    cycle:   billingCycleEnum,
    cpfCnpj: z.string().transform(onlyDigits).refine(isValidCpfCnpj, "CPF ou CNPJ inválido"),
    phone:   z.string().transform(onlyDigits).refine(v => v === "" || (v.length >= 10 && v.length <= 11), "Telefone inválido").optional(),
});

export const billingChangePlanSchema = z.object({
    planId: z.string().min(1),
    cycle:  billingCycleEnum,
});

export const systemSettingsSchema = z.object({
    appName:            z.string().min(1).optional(),
    logoUrl:            z.string().optional(),
    faviconUrl:         z.string().optional(),
    timezone:           z.string().optional(),
    enableRegistration: z.boolean().optional(),
});
