import crypto from "crypto";
import fs from "fs/promises";
import moment from "moment-timezone";
import { decryptPollVote, jidNormalizedUser, normalizeMessageContent, type WAMessage, type WASocket } from "@whiskeysockets/baileys";
import { Prisma, type FlowRun } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { isLidJid, resolveToPhoneJid } from "@/lib/jid-utils";
import {
    type ContentItem, type FlowAction, type FlowGraph, type FlowNode, type MenuData, type NodeDataMap,
    type RandomizerData, type SmartDelayData, type FieldScope,
} from "./types";
import { evalConditions, matchKeyword, matchMenuOption, menuText, pickWeighted, renderTemplate, unitMs, validateAnswer, zonedParts } from "./logic";

// Generous on purpose: a free-text router is a chain of ~30 conditions walked on every message.
// Real cycles are caught by MAX_VISITS_PER_ADVANCE long before these.
const MAX_STEPS_PER_ADVANCE = 150;
const MAX_STEPS_PER_RUN = 5000;
const MAX_VISITS_PER_ADVANCE = 20;
const MAX_INLINE_DELAY_S = 60;
const ACTIVE: FlowRun["status"][] = ["RUNNING", "WAITING_INPUT", "WAITING_DELAY"];

type Wait =
    | { kind: "input"; nodeId: string; itemIndex: number; attempts: number }
    | { kind: "menu"; nodeId: string; errors: number; poll?: PollRef }
    | { kind: "delay"; nodeId: string };

/** A poll sent by a Menu block: what's needed to decrypt and read a vote on it. */
interface PollRef { id: string; secret: string; creators: string[]; values: string[] }
const SIM_POLL_CREATOR = "simulador@sim";

export interface IncomingMessage {
    remoteJid: string;
    keyId: string;
    fromMe: boolean;
    type: string;
    content: string | null;
    mediaUrl: string | null;
}

interface Ctx {
    run: Omit<FlowRun, "graph" | "wait"> & { graph: FlowGraph; wait: Wait | null };
    sessionId: string;   // Session.sessionId (string used by Baileys/manager)
    dbSessionId: string; // Session.id
    jid: string;
    tz: string;
    visits: Map<string, number>;
    steps: number;
    lastText: string;    // text of the message being handled ({ultima-mensagem})
}

class StopRun extends Error { }

/** Simulation contacts ("<id>@sim") never touch WhatsApp: sends are only logged. */
export const isSimJid = (jid: string) => jid.endsWith("@sim");

// ---------- per-contact serialization (single process: the custom server runs Next + Baileys together) ----------
const g = global as unknown as { __flowQueues?: Map<string, Promise<unknown>>; __flowTimer?: NodeJS.Timeout };
const queues = (g.__flowQueues ??= new Map());

function enqueue<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prev = queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(job);
    queues.set(key, next);
    next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => undefined);
    return next;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function getSocket(sessionId: string): Promise<WASocket | null> {
    const { waManager } = await import("@/modules/whatsapp/manager");
    const inst = waManager.getInstance(sessionId);
    return inst?.socket && inst.status === "CONNECTED" ? (inst.socket as WASocket) : null;
}

async function timezone(): Promise<string> {
    const cfg = await prisma.systemConfig.findUnique({ where: { id: "default" }, select: { timezone: true } });
    return cfg?.timezone || process.env.TZ || "America/Sao_Paulo";
}

async function log(runId: string, nodeId: string | null, event: string, detail?: unknown) {
    await prisma.flowRunLog.create({ data: { runId, nodeId, event, detail: detail === undefined ? undefined : (detail as Prisma.InputJsonValue) } })
        .catch(e => logger.error("Flow", "log failed", e));
}

async function bumpStat(ctx: Ctx, nodeId: string, key: string) {
    if (ctx.run.isTest) return;
    await prisma.flowNodeStat.upsert({
        where: { flowId_nodeId_key: { flowId: ctx.run.flowId, nodeId, key } },
        create: { flowId: ctx.run.flowId, nodeId, key, count: 1 },
        update: { count: { increment: 1 } },
    }).catch(() => undefined);
}

async function save(ctx: Ctx, data: Partial<Pick<FlowRun, "status" | "currentNodeId" | "resumeAt" | "error" | "lastKeyId">> & { wait?: Wait | null }) {
    const { wait, ...rest } = data;
    const updated = await prisma.flowRun.update({
        where: { id: ctx.run.id },
        data: { ...rest, stepCount: ctx.run.stepCount, ...(wait !== undefined ? { wait: wait === null ? Prisma.DbNull : (wait as unknown as Prisma.InputJsonValue) } : {}) },
    });
    ctx.run = { ...ctx.run, ...updated, graph: ctx.run.graph, wait: wait !== undefined ? wait : ctx.run.wait };
}

// ---------- contact data ----------
async function flowData(dbSessionId: string, jid: string) {
    return prisma.contactFlowData.findUnique({ where: { sessionId_contactJid: { sessionId: dbSessionId, contactJid: jid } } });
}

async function setFlowData(dbSessionId: string, jid: string, patch: { fields?: Record<string, string | undefined>; pausedUntil?: Date | null; autoReplyOffUntil?: Date | null }) {
    const cur = await flowData(dbSessionId, jid);
    const fields = patch.fields ? { ...((cur?.fields as Record<string, string>) || {}), ...patch.fields } : undefined;
    if (fields) for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
    const data = {
        ...(fields ? { fields } : {}),
        ...(patch.pausedUntil !== undefined ? { pausedUntil: patch.pausedUntil } : {}),
        ...(patch.autoReplyOffUntil !== undefined ? { autoReplyOffUntil: patch.autoReplyOffUntil } : {}),
    };
    await prisma.contactFlowData.upsert({
        where: { sessionId_contactJid: { sessionId: dbSessionId, contactJid: jid } },
        create: { sessionId: dbSessionId, contactJid: jid, ...data },
        update: data,
    });
}

async function variables(ctx: Ctx): Promise<Record<string, string>> {
    const [contact, fd, botVars] = await Promise.all([
        prisma.contact.findUnique({ where: { sessionId_jid: { sessionId: ctx.dbSessionId, jid: ctx.jid } }, select: { name: true, notify: true } }),
        flowData(ctx.dbSessionId, ctx.jid),
        prisma.botVariable.findMany({ where: { sessionId: ctx.dbSessionId } }),
    ]);
    const full = (contact?.name || contact?.notify || "").trim();
    const parts = full.split(/\s+/).filter(Boolean);
    const phone = ctx.jid.split("@")[0].split(":")[0];
    return {
        ...Object.fromEntries(botVars.map(v => [v.key, v.value])),
        ...((fd?.fields as Record<string, string>) || {}),
        "nome-completo": full,
        "primeiro-nome": parts[0] || "",
        "sobrenome": parts.slice(1).join(" "),
        "telefone": phone,
        "ddd": phone.startsWith("55") ? phone.slice(2, 4) : "",
        "ultima-mensagem": ctx.lastText,
        "agora": moment.tz(ctx.tz).format("YYYY-MM-DD HH:mm"),
    };
}

async function setField(ctx: Ctx, key: string, scope: FieldScope | undefined, value: string | undefined) {
    if (scope === "BOT") {
        if (value === undefined) await prisma.botVariable.deleteMany({ where: { sessionId: ctx.dbSessionId, key } });
        else await prisma.botVariable.upsert({ where: { sessionId_key: { sessionId: ctx.dbSessionId, key } }, create: { sessionId: ctx.dbSessionId, key, value }, update: { value } });
    } else {
        await setFlowData(ctx.dbSessionId, ctx.jid, { fields: { [key]: value } });
    }
}

// ---------- sending ----------
async function send(ctx: Ctx, nodeId: string, payload: Parameters<WASocket["sendMessage"]>[1], summary: string, to = ctx.jid) {
    if (isSimJid(ctx.jid)) {
        const text = "text" in payload ? payload.text : summary;
        await log(ctx.run.id, nodeId, "SEND", { to: to === ctx.jid ? undefined : to, summary, text, simulated: true });
        return undefined;
    }
    const sock = await getSocket(ctx.sessionId);
    if (!sock) throw new Error("Sessão do WhatsApp desconectada");
    const sent = await sock.sendMessage(to, payload);
    await log(ctx.run.id, nodeId, "SEND", { to: to === ctx.jid ? undefined : to, summary });
    return sent;
}

async function sendItem(ctx: Ctx, nodeId: string, item: ContentItem, vars: Record<string, string>) {
    switch (item.kind) {
        case "text":
            return send(ctx, nodeId, { text: renderTemplate(item.text, vars) }, item.text.slice(0, 80));
        case "image": case "video": case "audio": case "file": {
            let media: Buffer | { url: string };
            let mime = "application/octet-stream";
            let fileName = item.fileName || "arquivo";
            if (item.assetId) {
                const asset = await prisma.flowAsset.findFirst({ where: { id: item.assetId, sessionId: ctx.dbSessionId } });
                if (!asset) throw new Error("Arquivo de mídia não encontrado");
                media = await fs.readFile(asset.path);
                mime = asset.mime;
                fileName = item.fileName || asset.originalName;
            } else if (item.url) {
                media = { url: item.url };
            } else throw new Error("Mídia sem arquivo");
            const caption = item.caption ? renderTemplate(item.caption, vars) : undefined;
            const payload =
                item.kind === "image" ? { image: media, caption } :
                item.kind === "video" ? { video: media, caption } :
                item.kind === "audio" ? { audio: media, mimetype: mime.startsWith("audio/") ? mime : "audio/mpeg" } :
                { document: media, mimetype: mime, fileName, caption };
            return send(ctx, nodeId, payload as Parameters<WASocket["sendMessage"]>[1], `${item.kind}: ${fileName}`);
        }
        case "vcard": {
            const digits = item.phone.replace(/\D/g, "");
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${item.name}\n${item.org ? `ORG:${item.org};\n` : ""}TEL;type=CELL;type=VOICE;waid=${digits}:+${digits}\nEND:VCARD`;
            return send(ctx, nodeId, { contacts: { displayName: item.name, contacts: [{ vcard }] } }, `contato: ${item.name}`);
        }
        case "delay": {
            if (isSimJid(ctx.jid)) return;
            const secs = Math.min(Math.max(0, item.seconds), MAX_INLINE_DELAY_S);
            const sock = item.typing ? await getSocket(ctx.sessionId) : null;
            await sock?.sendPresenceUpdate("composing", ctx.jid).catch(() => undefined);
            await sleep(secs * 1000);
            await sock?.sendPresenceUpdate("paused", ctx.jid).catch(() => undefined);
            return;
        }
        case "autoOff":
            await setFlowData(ctx.dbSessionId, ctx.jid, { autoReplyOffUntil: new Date(Date.now() + item.seconds * 1000) });
            return log(ctx.run.id, nodeId, "ACTION", { autoOffSeconds: item.seconds });
        case "input":
            return send(ctx, nodeId, { text: renderTemplate(item.question, vars) }, item.question.slice(0, 80));
    }
}

/** Sends a single-choice WhatsApp poll. We pick the secret so a vote can be decrypted later (Baileys 7 doesn't do it). */
async function sendPoll(ctx: Ctx, nodeId: string, name: string, values: string[]): Promise<PollRef> {
    const secret = crypto.randomBytes(32);
    const shown = `📊 ${name}\n\n${values.map(v => `○ ${v}`).join("\n")}`;
    const sent = await send(ctx, nodeId, { poll: { name, values, selectableCount: 1, messageSecret: secret } }, shown);
    if (isSimJid(ctx.jid)) return { id: `SIMPOLL${crypto.randomUUID()}`, secret: secret.toString("base64"), creators: [SIM_POLL_CREATOR], values };
    const me = (await getSocket(ctx.sessionId))?.user;
    if (!sent?.key.id) throw new Error("Enquete enviada sem id");
    // a vote is signed with our phone jid or our LID, depending on how the chat is addressed
    return { id: sent.key.id, secret: secret.toString("base64"), creators: [me?.id, me?.lid].filter((j): j is string => !!j).map(jidNormalizedUser), values };
}

// ---------- actions ----------
async function runAction(ctx: Ctx, nodeId: string, a: FlowAction, vars: Record<string, string>) {
    switch (a.type) {
        case "addTag": case "removeTag": {
            const label = await prisma.label.findFirst({ where: { id: a.labelId, sessionId: ctx.sessionId } });
            if (!label) throw new Error("Etiqueta não encontrada");
            if (a.type === "addTag") {
                await prisma.chatLabel.upsert({ where: { labelId_chatJid: { labelId: label.id, chatJid: ctx.jid } }, create: { labelId: label.id, chatJid: ctx.jid }, update: {} });
            } else {
                await prisma.chatLabel.deleteMany({ where: { labelId: label.id, chatJid: ctx.jid } });
            }
            return log(ctx.run.id, nodeId, "ACTION", { [a.type]: label.name });
        }
        case "setField": {
            const value = renderTemplate(a.value, vars);
            await setField(ctx, a.fieldKey!, a.fieldScope, value);
            vars[a.fieldKey!] = value;
            return log(ctx.run.id, nodeId, "ACTION", { setField: a.fieldKey, value });
        }
        case "clearField":
            await setField(ctx, a.fieldKey!, a.fieldScope, undefined);
            delete vars[a.fieldKey!];
            return log(ctx.run.id, nodeId, "ACTION", { clearField: a.fieldKey });
        case "notify": {
            const text = renderTemplate(a.message, vars);
            // phones may come from a bot field ({TELEFONE_EQUIPE}); an empty value just skips the notification
            const phones = renderTemplate(a.phones, vars).split(/[,;\s]+/).map(s => s.replace(/\D/g, "")).filter(Boolean);
            if (!phones.length) return log(ctx.run.id, nodeId, "ACTION", { notify: "sem número configurado" });
            for (const p of phones) {
                await send(ctx, nodeId, { text }, "notificação da equipe", `${p}@s.whatsapp.net`);
            }
            return;
        }
        case "pauseAutomation": {
            const until = a.forever ? new Date("9999-12-31T00:00:00Z") : new Date(Date.now() + a.value * unitMs[a.unit]);
            await setFlowData(ctx.dbSessionId, ctx.jid, { pausedUntil: until });
            return log(ctx.run.id, nodeId, "ACTION", { pausedUntil: until.toISOString() });
        }
        case "resumeAutomation":
            await setFlowData(ctx.dbSessionId, ctx.jid, { pausedUntil: null });
            return log(ctx.run.id, nodeId, "ACTION", { resumeAutomation: true });
        case "optOut":
            // same list the broadcast sender checks ("Pular quem pediu para sair")
            await prisma.broadcastOptOut.upsert({ where: { sessionId_jid: { sessionId: ctx.sessionId, jid: ctx.jid } }, create: { sessionId: ctx.sessionId, jid: ctx.jid }, update: {} });
            return log(ctx.run.id, nodeId, "ACTION", { optOut: true });
    }
}

// ---------- graph walking ----------
function nodeById(ctx: Ctx, id: string): FlowNode | undefined {
    return ctx.run.graph.nodes.find(n => n.id === id);
}

function follow(ctx: Ctx, nodeId: string, handle: string): string | null {
    return ctx.run.graph.edges.find(e => e.source === nodeId && e.sourceHandle === handle)?.target ?? null;
}

async function finish(ctx: Ctx, status: FlowRun["status"], error?: string) {
    await save(ctx, { status, wait: null, resumeAt: null, error: error ?? null });
    await log(ctx.run.id, null, status === "FAILED" ? "ERROR" : "END", { status, error });
}

async function fail(ctx: Ctx, error: string): Promise<never> {
    await finish(ctx, "FAILED", error);
    throw new StopRun(error);
}

/** Walk the graph from (nodeId, itemIndex) until the run waits, ends or fails. */
async function execute(ctx: Ctx, startNodeId: string | null, startItem = 0): Promise<void> {
    let nodeId = startNodeId;
    let itemIndex = startItem;
    const vars = await variables(ctx);
    try {
        while (nodeId) {
            ctx.steps++;
            ctx.run.stepCount++;
            if (ctx.steps > MAX_STEPS_PER_ADVANCE || ctx.run.stepCount > MAX_STEPS_PER_RUN) await fail(ctx, "Limite de passos atingido (possível ciclo no fluxo).");
            const visits = (ctx.visits.get(nodeId) || 0) + 1;
            ctx.visits.set(nodeId, visits);
            if (visits > MAX_VISITS_PER_ADVANCE) await fail(ctx, "O mesmo bloco foi repetido demais (ciclo no fluxo).");

            const node = nodeById(ctx, nodeId);
            if (!node) break;
            await save(ctx, { status: "RUNNING", currentNodeId: node.id, wait: null, resumeAt: null });
            if (itemIndex === 0) {
                await log(ctx.run.id, node.id, "ENTER", { type: node.type });
                await bumpStat(ctx, node.id, "sent");
            }

            switch (node.type) {
                case "start":
                    nodeId = follow(ctx, node.id, "next");
                    break;

                case "content": {
                    const items = (node.data as NodeDataMap["content"]).items;
                    for (let i = itemIndex; i < items.length; i++) {
                        const it = items[i];
                        await sendItem(ctx, node.id, it, vars);
                        if (it.kind === "input") {
                            const resumeAt = new Date(Date.now() + Math.max(1, it.expireValue) * unitMs[it.expireUnit]);
                            await save(ctx, { status: "WAITING_INPUT", wait: { kind: "input", nodeId: node.id, itemIndex: i, attempts: 0 }, resumeAt });
                            await log(ctx.run.id, node.id, "WAIT", { input: it.answerType, until: resumeAt.toISOString() });
                            return;
                        }
                    }
                    nodeId = follow(ctx, node.id, "next");
                    break;
                }

                case "menu": {
                    const d = node.data as MenuData;
                    const poll = d.mode === "poll"
                        ? await sendPoll(ctx, node.id, renderTemplate(d.question, vars), d.options.map(o => renderTemplate(o.text, vars)))
                        : (await send(ctx, node.id, { text: renderTemplate(menuText(d.question, d.options), vars) }, d.question.slice(0, 80)), undefined);
                    const resumeAt = new Date(Date.now() + Math.max(1, d.expireValue) * unitMs[d.expireUnit]);
                    await save(ctx, { status: "WAITING_INPUT", wait: { kind: "menu", nodeId: node.id, errors: 0, ...(poll ? { poll } : {}) }, resumeAt });
                    await log(ctx.run.id, node.id, "WAIT", { menu: d.options.length, until: resumeAt.toISOString() });
                    return;
                }

                case "action": {
                    for (const a of (node.data as NodeDataMap["action"]).actions) {
                        try { await runAction(ctx, node.id, a, vars); }
                        catch (e) { await log(ctx.run.id, node.id, "ERROR", { action: a.type, error: (e as Error).message }); }
                    }
                    nodeId = follow(ctx, node.id, "next");
                    break;
                }

                case "condition": {
                    const tagIds = (await prisma.chatLabel.findMany({ where: { chatJid: ctx.jid, label: { sessionId: ctx.sessionId } }, select: { labelId: true } })).map(l => l.labelId);
                    const cd = node.data as NodeDataMap["condition"];
                    const conditions = cd.conditions.map(c => ({ ...c, value: renderTemplate(String(c.value ?? ""), vars) })); // values may use {campo}
                    const ok = evalConditions({ ...cd, conditions }, { tagIds, ...zonedParts(new Date(), ctx.tz), fields: vars });
                    await log(ctx.run.id, node.id, "BRANCH", { result: ok });
                    nodeId = follow(ctx, node.id, ok ? "true" : "false");
                    break;
                }

                case "randomizer": {
                    const d = node.data as RandomizerData;
                    let opt = null;
                    if (d.mode === "sequential" && d.options.length) {
                        const stat = ctx.run.isTest ? null : await prisma.flowNodeStat.upsert({
                            where: { flowId_nodeId_key: { flowId: ctx.run.flowId, nodeId: node.id, key: "seq" } },
                            create: { flowId: ctx.run.flowId, nodeId: node.id, key: "seq", count: 1 },
                            update: { count: { increment: 1 } },
                        });
                        opt = d.options[((stat?.count ?? 1) - 1) % d.options.length];
                    } else opt = pickWeighted(d.options, Math.random());
                    await log(ctx.run.id, node.id, "BRANCH", { option: opt ? d.options.indexOf(opt) + 1 : null });
                    nodeId = opt ? follow(ctx, node.id, `option:${opt.id}`) : null;
                    break;
                }

                case "smartDelay": {
                    const d = node.data as SmartDelayData;
                    const at = d.mode === "datetime"
                        ? moment.tz(d.datetime || "", "YYYY-MM-DDTHH:mm", ctx.tz).toDate()
                        : new Date(Date.now() + d.value * unitMs[d.unit]);
                    if (at.getTime() <= Date.now()) {
                        await log(ctx.run.id, node.id, "BRANCH", { skipped: "data já passou" });
                        nodeId = follow(ctx, node.id, "next");
                        break;
                    }
                    await save(ctx, { status: "WAITING_DELAY", wait: { kind: "delay", nodeId: node.id }, resumeAt: at });
                    await log(ctx.run.id, node.id, "WAIT", { until: at.toISOString() });
                    return;
                }

                case "flowLink": {
                    const target = (node.data as NodeDataMap["flowLink"]).flowId;
                    await finish(ctx, "COMPLETED");
                    const flow = target ? await prisma.flow.findFirst({ where: { id: target, sessionId: ctx.dbSessionId, status: "ACTIVE" } }) : null;
                    if (!flow?.publishedGraph) {
                        await log(ctx.run.id, node.id, "ERROR", { error: "Fluxo de destino não está ativo" });
                        return;
                    }
                    await startRun({ flowId: flow.id, graph: flow.publishedGraph as unknown as FlowGraph, dbSessionId: ctx.dbSessionId, sessionId: ctx.sessionId, jid: ctx.jid, text: ctx.lastText });
                    return;
                }
            }
            itemIndex = 0;
        }
        await finish(ctx, "COMPLETED");
    } catch (e) {
        if (e instanceof StopRun) return;
        logger.error("Flow", `run ${ctx.run.id} failed`, e);
        await finish(ctx, "FAILED", (e as Error).message);
    }
}

async function loadCtx(run: FlowRun, sessionId: string, lastText = ""): Promise<Ctx> {
    return {
        run: { ...run, graph: run.graph as unknown as FlowGraph, wait: run.wait as unknown as Wait | null },
        sessionId, dbSessionId: run.sessionId, jid: run.contactJid, tz: await timezone(), visits: new Map(), steps: 0, lastText,
    };
}

// ---------- public API ----------
export async function startRun(opts: { flowId: string; graph: FlowGraph; dbSessionId: string; sessionId: string; jid: string; isTest?: boolean; keyId?: string; text?: string; startNodeId?: string }) {
    const start = opts.startNodeId ? opts.graph.nodes.find(n => n.id === opts.startNodeId) : opts.graph.nodes.find(n => n.type === "start");
    if (!start) throw new Error(opts.startNodeId ? `Bloco "${opts.startNodeId}" não existe no fluxo` : "Fluxo sem bloco inicial");
    const run = await prisma.flowRun.create({
        data: {
            flowId: opts.flowId, sessionId: opts.dbSessionId, contactJid: opts.jid, isTest: !!opts.isTest,
            graph: opts.graph as unknown as Prisma.InputJsonValue, currentNodeId: start.id, lastKeyId: opts.keyId,
        },
    });
    await log(run.id, null, "START", { test: !!opts.isTest });
    const ctx = await loadCtx(run, opts.sessionId, opts.text);
    await execute(ctx, start.id);
    return run.id;
}

/** Runs a test of the draft for one phone number, replacing any active run of that contact. */
export async function startTestRun(opts: { flowId: string; graph: FlowGraph; dbSessionId: string; sessionId: string; jid: string; text?: string }) {
    return enqueue(`${opts.dbSessionId}:${opts.jid}`, async () => {
        await prisma.flowRun.updateMany({ where: { sessionId: opts.dbSessionId, contactJid: opts.jid, status: { in: ACTIVE } }, data: { status: "CANCELLED", wait: Prisma.DbNull, resumeAt: null } });
        return startRun({ ...opts, isTest: true });
    });
}

/**
 * Writes contact fields from outside a conversation (e.g. a purchase webhook). Serialized with the contact's runs so a
 * flow step never overwrites it. `start` then replaces the contact's active run with the published flow at one block;
 * that part is not awaited (sends can be slow and webhooks have short timeouts).
 */
export async function applyExternalEvent(opts: { dbSessionId: string; sessionId: string; jid: string; fields: Record<string, string>; start?: { flowId: string; graph: FlowGraph; nodeId: string } }) {
    const key = `${opts.dbSessionId}:${opts.jid}`;
    await enqueue(key, () => setFlowData(opts.dbSessionId, opts.jid, { fields: opts.fields }));
    const start = opts.start;
    if (!start) return;
    enqueue(key, async () => {
        await prisma.flowRun.updateMany({ where: { sessionId: opts.dbSessionId, contactJid: opts.jid, status: { in: ACTIVE } }, data: { status: "CANCELLED", wait: Prisma.DbNull, resumeAt: null } });
        await startRun({ flowId: start.flowId, graph: start.graph, dbSessionId: opts.dbSessionId, sessionId: opts.sessionId, jid: opts.jid, isTest: isSimJid(opts.jid), startNodeId: start.nodeId });
    }).catch(e => logger.error("Flow", "external start failed", e));
}

async function handleInput(ctx: Ctx, msg: IncomingMessage) {
    const wait = ctx.run.wait;
    if (!wait || wait.kind === "delay") return;
    const node = nodeById(ctx, wait.nodeId);
    if (!node) return finish(ctx, "FAILED", "Bloco de espera não existe mais");
    const answer = { text: msg.content || "", type: msg.type, mediaUrl: msg.mediaUrl };
    const vars = await variables(ctx);

    if (wait.kind === "input") {
        const item = (node.data as NodeDataMap["content"]).items[wait.itemIndex];
        if (!item || item.kind !== "input") return finish(ctx, "FAILED", "Captura não existe mais");
        const value = validateAnswer(item.answerType, answer);
        if (value === null) {
            const attempts = wait.attempts + 1;
            await log(ctx.run.id, node.id, "INVALID", { answer: answer.text.slice(0, 80), attempts });
            if (attempts >= Math.max(1, item.maxAttempts)) return timeoutPath(ctx, `input:${item.id}:timeout`);
            if (item.errorMessage.trim()) await send(ctx, node.id, { text: renderTemplate(item.errorMessage, vars) }, "mensagem de erro");
            return save(ctx, { wait: { ...wait, attempts }, lastKeyId: msg.keyId });
        }
        if (item.fieldKey) await setField(ctx, item.fieldKey, item.fieldScope, value);
        await log(ctx.run.id, node.id, "INPUT", { field: item.fieldKey, value: value.slice(0, 120) });
        await save(ctx, { lastKeyId: msg.keyId });
        const target = follow(ctx, node.id, `input:${item.id}:valid`);
        return target ? execute(ctx, target) : execute(ctx, node.id, wait.itemIndex + 1);
    }

    const d = node.data as MenuData;
    const opt = matchMenuOption(answer.text, d.options);
    if (opt) {
        await bumpStat(ctx, node.id, `option:${opt.id}`);
        await log(ctx.run.id, node.id, "INPUT", { option: d.options.indexOf(opt) + 1, text: opt.text });
        await save(ctx, { lastKeyId: msg.keyId });
        return execute(ctx, follow(ctx, node.id, `option:${opt.id}`));
    }
    const errors = wait.errors + 1;
    await log(ctx.run.id, node.id, "INVALID", { answer: answer.text.slice(0, 80), errors });
    if (d.maxErrors > 0 && errors >= d.maxErrors) {
        await save(ctx, { lastKeyId: msg.keyId });
        return execute(ctx, follow(ctx, node.id, "error"));
    }
    if (d.invalidText.trim()) await send(ctx, node.id, { text: renderTemplate(d.invalidText, vars) }, "entrada inválida");
    await save(ctx, { wait: { ...wait, errors }, lastKeyId: msg.keyId });
}

async function timeoutPath(ctx: Ctx, handle: string) {
    const target = ctx.run.wait ? follow(ctx, ctx.run.wait.nodeId, handle) : null;
    if (!target) return finish(ctx, "EXPIRED");
    await log(ctx.run.id, ctx.run.wait?.nodeId ?? null, "BRANCH", { path: "sem resposta" });
    return execute(ctx, target);
}

/** Called by the message store right after a NEW incoming message is saved (dedupe already done there). */
export function onIncomingMessage(sessionId: string, dbSessionId: string, msg: IncomingMessage) {
    const { isActiveProspectLead } = require("@/modules/prospect/responder");
    const jid = msg.remoteJid;
    if (msg.fromMe || !jid || jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter")) return;
    enqueue(`${dbSessionId}:${jid}`, async () => {
        const active = await prisma.flowRun.findFirst({ where: { sessionId: dbSessionId, contactJid: jid, status: { in: ACTIVE } }, orderBy: { startedAt: "desc" } });
        if (active) {
            if (active.lastKeyId === msg.keyId || active.status !== "WAITING_INPUT") return;
            return handleInput(await loadCtx(active, sessionId, msg.content || ""), msg);
        }

        const fd = await flowData(dbSessionId, jid);
        if (fd?.pausedUntil && fd.pausedUntil > new Date()) return;
        if (await isActiveProspectLead(sessionId, [jid]).catch(() => false)) return;

        const flows = await prisma.flow.findMany({ where: { sessionId: dbSessionId, status: "ACTIVE", publishedGraph: { not: Prisma.DbNull } }, include: { triggers: true } });
        if (!flows.length) return;
        const all = flows.flatMap(f => f.triggers.map(t => ({ t, f })));
        const text = msg.content || "";
        let hit = all.filter(x => x.t.type === "KEYWORD" && matchKeyword(text, x.t.keyword || "", x.t.matchType || "EXACT"))
            .sort((a, b) => b.t.priority - a.t.priority)[0];
        if (!hit && all.some(x => x.t.type === "FIRST_MESSAGE")) {
            const count = await prisma.message.count({ where: { sessionId: dbSessionId, remoteJid: jid } });
            if (count <= 1) hit = all.filter(x => x.t.type === "FIRST_MESSAGE").sort((a, b) => b.t.priority - a.t.priority)[0];
        }
        if (!hit) hit = all.filter(x => x.t.type === "ANY_MESSAGE").sort((a, b) => b.t.priority - a.t.priority)[0];
        if (!hit) return;

        logger.info("Flow", `Starting flow "${hit.f.name}" for ${jid}`);
        await startRun({ flowId: hit.f.id, graph: hit.f.publishedGraph as unknown as FlowGraph, dbSessionId, sessionId, jid, keyId: msg.keyId, text });
    }).catch(e => logger.error("Flow", "incoming handler failed", e));
}

/** Option index chosen in a vote, or null when it can't be decrypted or the vote was withdrawn. */
export function readPollVote(vote: { encPayload?: Uint8Array | null; encIv?: Uint8Array | null }, poll: PollRef, voters: string[]): number | null {
    if (!vote.encPayload || !vote.encIv) return null;
    const enc = { encPayload: vote.encPayload, encIv: vote.encIv };
    for (const pollCreatorJid of poll.creators) for (const voterJid of voters) {
        try {
            const { selectedOptions } = decryptPollVote(enc, { pollCreatorJid, pollMsgId: poll.id, pollEncKey: Buffer.from(poll.secret, "base64"), voterJid });
            const hash = selectedOptions?.[0] ? Buffer.from(selectedOptions[0]).toString("hex") : null;
            const i = hash ? poll.values.findIndex(v => crypto.createHash("sha256").update(v).digest("hex") === hash) : -1;
            return i >= 0 ? i : null;
        } catch { /* wrong jid pair: GCM auth fails, try the next */ }
    }
    return null;
}

/** Called by the message store for an incoming poll vote: a tap on a Menu block sent as a poll. */
export function onPollVote(sessionId: string, dbSessionId: string, msg: Pick<WAMessage, "key" | "message">) {
    const upd = normalizeMessageContent(msg.message)?.pollUpdateMessage;
    const pollId = upd?.pollCreationMessageKey?.id;
    const raw = msg.key.remoteJid;
    if (!upd?.vote || !pollId || msg.key.fromMe || !raw || raw.endsWith("@g.us")) return;
    const alt = (msg.key as { remoteJidAlt?: string }).remoteJidAlt;
    return (async () => {
        const jid = isLidJid(raw) ? await resolveToPhoneJid(raw, dbSessionId, alt) : raw; // runs are keyed like the store keys messages
        await enqueue(`${dbSessionId}:${jid}`, async () => {
            const active = await prisma.flowRun.findFirst({ where: { sessionId: dbSessionId, contactJid: jid, status: "WAITING_INPUT" }, orderBy: { startedAt: "desc" } });
            const poll = (active?.wait as Wait | null)?.kind === "menu" ? (active!.wait as { poll?: PollRef }).poll : undefined;
            if (!active || poll?.id !== pollId) return; // vote on an old poll or on a poll sent by hand
            const voters = [...new Set([raw, alt, jid, isSimJid(jid) ? jid : null].filter((j): j is string => !!j))];
            const i = readPollVote(upd.vote!, poll, voters);
            if (i === null) return logger.warn("Flow", `poll vote on run ${active.id} could not be read or was withdrawn`);
            const keyId = msg.key.id || `POLL${Date.now()}`;
            await handleInput(await loadCtx(active, sessionId, poll.values[i]), { remoteJid: jid, keyId, fromMe: false, type: "TEXT", content: String(i + 1), mediaUrl: null });
        });
    })().catch(e => logger.error("Flow", "poll vote handler failed", e));
}

/** Auto-reply must stay quiet while a flow owns the conversation or would start from this text. */
export async function shouldSuppressAutoReply(sessionId: string, jids: (string | null | undefined)[], text: string): Promise<boolean> {
    const session = await prisma.session.findUnique({ where: { sessionId }, select: { id: true } });
    if (!session) return false;
    const list = jids.filter(Boolean) as string[];
    const [active, fds, flows] = await Promise.all([
        prisma.flowRun.count({ where: { sessionId: session.id, contactJid: { in: list }, status: { in: ACTIVE } } }),
        prisma.contactFlowData.findMany({ where: { sessionId: session.id, contactJid: { in: list } } }),
        prisma.flow.findMany({ where: { sessionId: session.id, status: "ACTIVE" }, include: { triggers: true } }),
    ]);
    if (active) return true;
    const now = new Date();
    if (fds.some(f => (f.pausedUntil && f.pausedUntil > now) || (f.autoReplyOffUntil && f.autoReplyOffUntil > now))) return true;
    return flows.some(f => f.triggers.some(t => t.type === "ANY_MESSAGE" || (t.type === "KEYWORD" && matchKeyword(text, t.keyword || "", t.matchType || "EXACT"))));
}

export async function cancelRun(runId: string) {
    const run = await prisma.flowRun.findUnique({ where: { id: runId } });
    if (!run || !ACTIVE.includes(run.status)) return false;
    return enqueue(`${run.sessionId}:${run.contactJid}`, async () => {
        await prisma.flowRun.update({ where: { id: runId }, data: { status: "CANCELLED", wait: Prisma.DbNull, resumeAt: null } });
        await log(runId, null, "END", { status: "CANCELLED" });
        return true;
    });
}

/** Resumes delays and expires unanswered waits. Runs every 15 s. */
export async function tick() {
    const now = new Date();
    await prisma.flowRun.updateMany({ where: { status: "RUNNING", updatedAt: { lt: new Date(now.getTime() - 10 * 60_000) } }, data: { status: "FAILED", error: "Execução interrompida (servidor reiniciado?)" } });
    const due = await prisma.flowRun.findMany({ where: { status: { in: ["WAITING_DELAY", "WAITING_INPUT"] }, resumeAt: { lte: now } }, take: 50, orderBy: { resumeAt: "asc" } });
    if (!due.length) return;
    const sessions = await prisma.session.findMany({ where: { id: { in: [...new Set(due.map(r => r.sessionId))] } }, select: { id: true, sessionId: true } });
    for (const r of due) {
        const sessionId = sessions.find(s => s.id === r.sessionId)?.sessionId;
        if (!sessionId || (!isSimJid(r.contactJid) && !(await getSocket(sessionId)))) continue; // retry when the session is back
        await enqueue(`${r.sessionId}:${r.contactJid}`, async () => {
            // Atomic claim: even if two schedulers run (e.g. dev hot reload), only one resumes the run.
            const claim = await prisma.flowRun.updateMany({ where: { id: r.id, status: r.status, resumeAt: r.resumeAt }, data: { resumeAt: null } });
            if (!claim.count) return;
            const fresh = await prisma.flowRun.findUnique({ where: { id: r.id } });
            if (!fresh) return;
            const ctx = await loadCtx(fresh, sessionId);
            const wait = ctx.run.wait;
            if (!wait) return finish(ctx, "FAILED", "Espera sem estado");
            if (wait.kind === "delay") return execute(ctx, follow(ctx, wait.nodeId, "next"));
            if (wait.kind === "menu") return timeoutPath(ctx, "timeout");
            const item = (nodeById(ctx, wait.nodeId)?.data as NodeDataMap["content"] | undefined)?.items[wait.itemIndex];
            return timeoutPath(ctx, `input:${item?.id}:timeout`);
        }).catch(e => logger.error("Flow", "tick failed", e));
    }
}

export function startFlowScheduler() {
    if (g.__flowTimer) return;
    g.__flowTimer = setInterval(() => { tick().catch(e => logger.error("Flow", "scheduler error", e)); }, 15_000);
    logger.info("Flow", "Flow scheduler started");
}

// ---------- simulation (editor preview; nothing is sent to WhatsApp) ----------
export type SimTrigger = { type: string; keyword?: string | null; matchType?: string | null };

/** Handles one typed message of a simulated contact against the DRAFT graph. */
export async function simulateIncoming(opts: { flowId: string; graph: FlowGraph; triggers: SimTrigger[]; dbSessionId: string; sessionId: string; jid: string; text: string }) {
    if (!isSimJid(opts.jid)) throw new Error("Simulação só aceita contatos @sim");
    const { dbSessionId, jid, text } = opts;
    return enqueue(`${dbSessionId}:${jid}`, async (): Promise<"handled" | "waiting" | "paused" | "no-trigger"> => {
        const keyId = `SIM${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
        const active = await prisma.flowRun.findFirst({ where: { sessionId: dbSessionId, contactJid: jid, status: { in: ACTIVE } }, orderBy: { startedAt: "desc" } });
        if (active) {
            if (active.status !== "WAITING_INPUT") return "waiting";
            await handleInput(await loadCtx(active, opts.sessionId, text), { remoteJid: jid, keyId, fromMe: false, type: "TEXT", content: text, mediaUrl: null });
            return "handled";
        }
        const fd = await flowData(dbSessionId, jid);
        if (fd?.pausedUntil && fd.pausedUntil > new Date()) return "paused";
        const hasRuns = (await prisma.flowRun.count({ where: { sessionId: dbSessionId, contactJid: jid } })) > 0;
        const hit = !opts.triggers.length || opts.triggers.some(t =>
            t.type === "ANY_MESSAGE" || (t.type === "FIRST_MESSAGE" && !hasRuns) ||
            (t.type === "KEYWORD" && matchKeyword(text, t.keyword || "", t.matchType || "EXACT")));
        if (!hit) return "no-trigger";
        await startRun({ flowId: opts.flowId, graph: opts.graph, dbSessionId, sessionId: opts.sessionId, jid, isTest: true, keyId, text });
        return "handled";
    });
}

/** Forgets everything about a simulated contact: runs, fields, pause, tags and opt-out. */
export async function resetSimulation(dbSessionId: string, sessionId: string, jid: string) {
    if (!isSimJid(jid)) throw new Error("Simulação só aceita contatos @sim");
    return enqueue(`${dbSessionId}:${jid}`, async () => {
        await prisma.flowRun.deleteMany({ where: { sessionId: dbSessionId, contactJid: jid } });
        await prisma.contactFlowData.deleteMany({ where: { sessionId: dbSessionId, contactJid: jid } });
        await prisma.chatLabel.deleteMany({ where: { chatJid: jid, label: { sessionId } } });
        await prisma.broadcastOptOut.deleteMany({ where: { sessionId, jid } });
    });
}
