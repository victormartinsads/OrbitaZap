"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowRight, Braces, CalendarClock, Check, CheckCheck, ChevronDown, Clock, Eye, FileText, Info, Loader2, Minus, MoreVertical,
    Paperclip, Plus, Search, Send, ShieldCheck, Smile, Tag, Timer, Trash2, Upload, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/components/dashboard/session-provider";
import { GroupAvatar, type GroupRow } from "@/components/groups/group-ui";
import { cn } from "@/lib/utils";
import { BROADCAST_VARIABLES, MAX_MESSAGE_LENGTH, parsePhones, renderBroadcast } from "@/modules/broadcast/template";

export interface BroadcastDraft {
    id: string; name: string; message: string; recipients: string[]; mediaAssetId: string | null; intervalMs: number;
    pauseOnFailure: boolean; skipOptedOut: boolean; scheduledAt: string | null; updatedAt: string;
}
interface AudienceItem { jid: string; name: string; phone: string; labels: { id: string; name: string; colorHex: string }[]; optedOut: boolean }
interface Label { id: string; name: string; colorHex: string; count: number }
interface Attachment { id: string; name: string; mime: string }

const MIN_INTERVAL_S = 10; // Piso de seguranca anti-bloqueio humanizado recomendavel para campanhas
const EMOJIS = ["😀", "😁", "😂", "😊", "😍", "🥰", "😉", "😎", "🤩", "🙏", "👍", "👏", "🙌", "💪", "🎉", "🔥", "✨", "❤️", "💚", "✅", "📢", "📣", "🛍️", "💰", "🎁", "📅", "⏰", "📍", "👉", "⭐"];
const green = "bg-[#00bcfe] text-white hover:bg-[#0084cc]";

export function formatDuration(totalSeconds: number) {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return `${h} h${m ? ` ${m} min` : ""}`;
    if (m) return `${m} min${sec ? ` ${sec} s` : ""}`;
    return `${sec} s`;
}

/** "+55 •• •••••-1234": enough to recognise a number without exposing it on screen. */
function maskPhone(digits: string) {
    if (!digits) return "Número oculto";
    const last = digits.slice(-4);
    return digits.startsWith("55") ? `+55 •• •••••-${last}` : `+${digits.slice(0, 2)} ••• ${last}`;
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const asJid = (digits: string) => `${digits}@s.whatsapp.net`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const isForm = init?.body instanceof FormData;
    const res = await fetch(url, { ...init, headers: init?.body && !isForm ? { "Content-Type": "application/json" } : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status === false) throw new Error(json.message || "Falha na requisição");
    return json.data as T;
}

export function NewBroadcast({ sessionId, draft, onStarted, onDraftSaved }: {
    sessionId: string; draft?: BroadcastDraft | null;
    onStarted: (id: string) => void; onDraftSaved: () => void;
}) {
    const { sessions } = useSession();
    const session = sessions.find(s => s.sessionId === sessionId);

    // ---------------- form state (seeded from a draft when one is opened)
    const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
    const [name, setName] = useState(draft?.name ?? "");
    const [message, setMessage] = useState(draft?.message ?? "");
    const [contacts, setContacts] = useState<Record<string, string>>(() => Object.fromEntries((draft?.recipients ?? []).map(j => [j, ""])));
    const [imported, setImported] = useState<{ file: string; phones: string[] } | null>(null);
    const [pasted, setPasted] = useState("");
    const [attachment, setAttachment] = useState<Attachment | null>(draft?.mediaAssetId ? { id: draft.mediaAssetId, name: "Anexo do rascunho", mime: "" } : null);
    const initialSeconds = Math.round((draft?.intervalMs ?? 10000) / 1000);
    const [intervalUnit, setIntervalUnit] = useState<"seconds" | "minutes">(initialSeconds >= 60 && initialSeconds % 60 === 0 ? "minutes" : "seconds");
    const [intervalValue, setIntervalValue] = useState(initialSeconds >= 60 && initialSeconds % 60 === 0 ? initialSeconds / 60 : initialSeconds);
    const [pauseOnFailure, setPauseOnFailure] = useState(draft?.pauseOnFailure ?? true);
    const [skipOptedOut, setSkipOptedOut] = useState(draft?.skipOptedOut ?? true);
    const [when, setWhen] = useState<"now" | "schedule">(draft?.scheduledAt ? "schedule" : "now");
    const [scheduledAt, setScheduledAt] = useState(() => toLocalInput(draft?.scheduledAt ? new Date(draft.scheduledAt) : new Date(Date.now() + 3600_000)));
    const [tab, setTab] = useState<"contacts" | "file" | "paste">("contacts");
    const [savingDraft, setSavingDraft] = useState(false);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [starting, setStarting] = useState(false);
    const [testing, setTesting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const textRef = useRef<HTMLTextAreaElement>(null);

    // ---------------- audience (real contacts)
    const [q, setQ] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");
    const [label, setLabel] = useState("");
    const [items, setItems] = useState<AudienceItem[]>([]);
    const [labels, setLabels] = useState<Label[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loadingAudience, setLoadingAudience] = useState(true);
    const [audienceError, setAudienceError] = useState("");
    useEffect(() => { const t = setTimeout(() => setDebouncedQ(q), 300); return () => clearTimeout(t); }, [q]);
    useEffect(() => {
        let alive = true;
        const qs = new URLSearchParams({ q: debouncedQ, label, page: String(page), limit: "50" });
        api<{ items: AudienceItem[]; total: number; labels: Label[] }>(`/api/messages/${sessionId}/broadcast/audience?${qs}`)
            .then(d => { if (!alive) return; setItems(prev => (page === 1 ? d.items : [...prev, ...d.items])); setTotal(d.total); setLabels(d.labels); setAudienceError(""); })
            .catch(e => { if (alive) setAudienceError((e as Error).message); })
            .finally(() => { if (alive) setLoadingAudience(false); });
        return () => { alive = false; };
    }, [sessionId, debouncedQ, label, page]);
    const changeFilter = (fn: () => void) => { fn(); setPage(1); setLoadingAudience(true); };

    // ---------------- derived
    const pastedPhones = useMemo(() => parsePhones(pasted), [pasted]);
    const recipients = useMemo(() => [...new Set([...Object.keys(contacts), ...(imported?.phones ?? []).map(asJid), ...pastedPhones.map(asJid)])], [contacts, imported, pastedPhones]);
    const intervalSeconds = Math.max(MIN_INTERVAL_S, intervalValue * (intervalUnit === "minutes" ? 60 : 1));
    const belowFloor = intervalValue * (intervalUnit === "minutes" ? 60 : 1) < MIN_INTERVAL_S;
    const unitLabel = (n: number) => (intervalUnit === "minutes" ? (n === 1 ? "minuto" : "minutos") : n === 1 ? "segundo" : "segundos");
    const intervalText = belowFloor ? `${MIN_INTERVAL_S} segundos` : `${intervalValue} ${unitLabel(intervalValue)}`;
    const estimate = recipients.length > 1 ? formatDuration((recipients.length - 1) * intervalSeconds) : recipients.length === 1 ? "imediato" : "—";
    const previewContact = useMemo(() => {
        // Drafts store only jids: take the name from the loaded contact list when the selection has none
        const known = (jid: string) => contacts[jid] || items.find(i => i.jid === jid)?.name || "";
        const jid = Object.keys(contacts).find(j => known(j)) ?? recipients[0];
        return jid ? { jid, name: known(jid) } : null;
    }, [contacts, recipients, items]);
    const preview = previewContact ? renderBroadcast(message, previewContact) : message.replace(/\{\{\s*nome\s*\}\}/g, "(nome)").replace(/\{\{\s*primeiro_nome\s*\}\}/g, "(nome)").replace(/\{\{\s*telefone\s*\}\}/g, "(telefone)");
    const step1 = recipients.length > 0, step2 = !!message.trim() || !!attachment;
    const scheduleDate = new Date(scheduledAt);
    const scheduleInvalid = when === "schedule" && (isNaN(scheduleDate.getTime()) || scheduleDate.getTime() < Date.now());
    const loadedAllSelected = items.length > 0 && items.every(i => i.jid in contacts);

    const toggleContact = (it: AudienceItem) => setContacts(c => { const n = { ...c }; if (it.jid in n) delete n[it.jid]; else n[it.jid] = it.name; return n; });
    const toggleLoaded = () => setContacts(c => {
        const n = { ...c };
        if (loadedAllSelected) items.forEach(i => delete n[i.jid]); else items.forEach(i => { n[i.jid] = i.name; });
        return n;
    });
    const selectAllResults = async () => {
        try {
            const qs = new URLSearchParams({ q: debouncedQ, label, all: "1" });
            const { jids } = await api<{ jids: string[] }>(`/api/messages/${sessionId}/broadcast/audience?${qs}`);
            const names = Object.fromEntries(items.map(i => [i.jid, i.name]));
            setContacts(c => ({ ...c, ...Object.fromEntries(jids.map(j => [j, c[j] || names[j] || ""])) }));
            toast.success(`${jids.length} contatos selecionados`);
        } catch (e) { toast.error((e as Error).message); }
    };
    const clearSelection = () => { setContacts({}); setImported(null); setPasted(""); };

    const setOptOut = async (it: AudienceItem, optedOut: boolean) => {
        try {
            await api(`/api/messages/${sessionId}/broadcast/optout`, { method: "PUT", body: JSON.stringify({ jid: it.jid, optedOut }) });
            setItems(list => list.map(i => (i.jid === it.jid ? { ...i, optedOut } : i)));
            toast.success(optedOut ? "Contato descadastrado das transmissões" : "Contato reativado");
        } catch (e) { toast.error((e as Error).message); }
    };

    const importFile = async (file: File) => {
        if (file.size > 2 * 1024 * 1024) { toast.error("Arquivo maior que 2 MB"); return; }
        const phones = parsePhones(await file.text());
        if (!phones.length) { toast.error("Nenhum número encontrado no arquivo"); return; }
        setImported({ file: file.name, phones });
        toast.success(`${phones.length} números importados de ${file.name}`);
    };

    const insertAtCursor = (text: string) => {
        const el = textRef.current;
        const start = el?.selectionStart ?? message.length, end = el?.selectionEnd ?? message.length;
        const next = (message.slice(0, start) + text + message.slice(end)).slice(0, MAX_MESSAGE_LENGTH);
        setMessage(next);
        requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + text.length, start + text.length); });
    };

    const upload = async (file: File) => {
        const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "file";
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("kind", kind);
            const a = await api<{ id: string; originalName: string; mime: string }>(`/api/flows/${sessionId}/assets`, { method: "POST", body: fd });
            setAttachment({ id: a.id, name: a.originalName, mime: a.mime });
        } catch (e) { toast.error((e as Error).message); } finally { setUploading(false); }
    };

    const payload = () => ({
        name, message, recipients, mediaAssetId: attachment?.id ?? null,
        intervalMs: intervalSeconds * 1000, pauseOnFailure, skipOptedOut,
        scheduledAt: when === "schedule" && !isNaN(scheduleDate.getTime()) ? scheduleDate.toISOString() : null,
    });

    const saveDraft = async () => {
        if (savingDraft) return;
        setSavingDraft(true);
        try {
            const body = JSON.stringify(payload());
            const saved = draftId
                ? await api<BroadcastDraft>(`/api/messages/${sessionId}/broadcast/drafts/${draftId}`, { method: "PUT", body })
                : await api<BroadcastDraft>(`/api/messages/${sessionId}/broadcast/drafts`, { method: "POST", body });
            setDraftId(saved.id);
            toast.success("Rascunho salvo");
            onDraftSaved();
        } catch (e) { toast.error((e as Error).message); } finally { setSavingDraft(false); }
    };

    const sendTest = async () => {
        if (testing) return;
        setTesting(true);
        try {
            await api(`/api/messages/${sessionId}/broadcast/test`, { method: "POST", body: JSON.stringify({ message, mediaAssetId: attachment?.id }) });
            toast.success("Teste enviado para o seu próprio WhatsApp");
        } catch (e) { toast.error((e as Error).message); } finally { setTesting(false); }
    };

    const start = async () => {
        if (starting) return;
        setStarting(true);
        try {
            const p = payload();
            const res = await api<{ broadcastId: string; total: number; skippedOptOut: number }>(`/api/messages/${sessionId}/broadcast`, {
                method: "POST",
                body: JSON.stringify({
                    name: p.name, message: p.message, recipients: p.recipients, mediaAssetId: p.mediaAssetId ?? undefined,
                    interval: { value: intervalSeconds, unit: "seconds" }, pauseOnFailure, skipOptedOut, scheduledAt: p.scheduledAt ?? undefined,
                }),
            });
            if (draftId) await fetch(`/api/messages/${sessionId}/broadcast/drafts/${draftId}`, { method: "DELETE" }).catch(() => undefined);
            toast.success(when === "schedule" ? `Transmissão agendada para ${scheduleDate.toLocaleString("pt-BR")}` : `Transmissão iniciada para ${res.total} destinatários`);
            if (res.skippedOptOut) toast.info(`${res.skippedOptOut} contato(s) descadastrado(s) ficaram de fora`);
            setReviewOpen(false);
            onStarted(res.broadcastId);
        } catch (e) { toast.error((e as Error).message); } finally { setStarting(false); }
    };

    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    return (
        <div className="space-y-4 pb-28">
            {/* Steps */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-sm lg:flex-row lg:items-center">
                <ol className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                    <Step n={1} title="Destinatários" text="Selecione os contatos" state={step1 ? "done" : "current"} />
                    <span className="hidden flex-1 border-t-2 border-dashed border-border sm:block" />
                    <Step n={2} title="Mensagem" text="Escreva sua mensagem" state={step2 ? "done" : step1 ? "current" : "todo"} />
                    <span className="hidden flex-1 border-t-2 border-dashed border-border sm:block" />
                    <Step n={3} title="Revisão e envio" text="Confira e envie" state={step1 && step2 ? "current" : "todo"} />
                </ol>
                <div className="hidden h-10 w-px bg-border lg:block" />
                <Button variant="outline" onClick={saveDraft} disabled={savingDraft} className="h-10 rounded-xl">
                    {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Salvar rascunho
                </Button>
            </div>

            {/* Campaign name */}
            <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <span className="shrink-0 text-sm font-semibold">Nome da campanha</span>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="Ex.: Novidades da comunidade"
                    className="h-11 flex-1 rounded-xl border border-border/80 bg-card px-4 text-[15px] shadow-sm outline-none focus:ring-2 focus:ring-ring/30" />
            </label>

            <div className="grid gap-4 xl:grid-cols-2">
                {/* LEFT */}
                <div className="space-y-4">
                    {/* Recipients */}
                    <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-semibold">Destinatários</h2>
                            <span className="rounded-full bg-[#e0f2fe] px-2.5 py-0.5 text-xs font-semibold text-[#00bcfe]">{recipients.length} {recipients.length === 1 ? "selecionado" : "selecionados"}</span>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">Escolha os contatos que receberão esta transmissão.</p>

                        <div className="mt-3 flex gap-1 border-b border-border/80">
                            {([["contacts", "Selecionar contatos"], ["file", "Importar arquivo"], ["paste", "Colar números"]] as const).map(([k, l]) => (
                                <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
                                    className={cn("-mb-px border-b-2 px-3 pb-2 text-sm font-medium transition", tab === k ? "border-[#00bcfe] text-[#00bcfe]" : "border-transparent text-muted-foreground hover:text-foreground")}>
                                    {l}{k === "file" && imported ? ` (${imported.phones.length})` : k === "paste" && pastedPhones.length ? ` (${pastedPhones.length})` : ""}
                                </button>
                            ))}
                        </div>

                        {tab === "contacts" && (
                            <div className="mt-3 space-y-3">
                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <div className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-border px-3">
                                        <Search className="h-4 w-4 text-muted-foreground" />
                                        <input value={q} onChange={e => changeFilter(() => setQ(e.target.value))} placeholder="Buscar por nome ou telefone..." aria-label="Buscar contatos"
                                            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                                    </div>
                                    <div className="relative">
                                        <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                        <select value={label} onChange={e => changeFilter(() => setLabel(e.target.value))} aria-label="Filtrar por etiqueta"
                                            disabled={!labels.length} title={labels.length ? undefined : "Nenhuma etiqueta criada ainda (menu Etiquetas)"}
                                            className="h-10 w-full appearance-none rounded-lg border border-border bg-background pl-9 pr-8 text-sm disabled:opacity-60 sm:w-48">
                                            <option value="">Etiquetas</option>
                                            {labels.map(l => <option key={l.id} value={l.id}>{l.name} ({l.count})</option>)}
                                        </select>
                                        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                    </div>
                                </div>

                                <div className="overflow-hidden rounded-lg border border-border">
                                    <div className="grid grid-cols-[40px_1fr_auto] items-center gap-2 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid-cols-[40px_minmax(0,1.4fr)_1fr_1fr_32px]">
                                        <Checkbox checked={loadedAllSelected} onCheckedChange={toggleLoaded} aria-label="Selecionar os contatos listados" disabled={!items.length} />
                                        <span>Nome</span>
                                        <span className="hidden sm:block">Telefone</span>
                                        <span className="hidden sm:block">Etiquetas</span>
                                        <span />
                                    </div>
                                    <div className="max-h-[320px] overflow-y-auto">
                                        {loadingAudience && !items.length ? (
                                            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando contatos…</div>
                                        ) : audienceError ? (
                                            <div className="py-8 text-center text-sm text-destructive">{audienceError}</div>
                                        ) : !items.length ? (
                                            <div className="py-10 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</div>
                                        ) : items.map(it => (
                                            <div key={it.jid} className={cn("grid cursor-pointer grid-cols-[40px_1fr_auto] items-center gap-2 border-t border-border/70 px-3 py-2 text-sm transition sm:grid-cols-[40px_minmax(0,1.4fr)_1fr_1fr_32px]",
                                                it.jid in contacts ? "bg-[#F4FBF7]" : "hover:bg-muted/40")} onClick={() => toggleContact(it)}>
                                                <span onClick={e => e.stopPropagation()}><Checkbox checked={it.jid in contacts} onCheckedChange={() => toggleContact(it)} aria-label={`Selecionar ${it.name || it.phone}`} /></span>
                                                <span className="flex min-w-0 items-center gap-2.5">
                                                    <GroupAvatar sessionId={sessionId} group={{ jid: it.jid, subject: it.name } as GroupRow} className="h-8 w-8 text-[11px]" />
                                                    <span className="min-w-0">
                                                        <span className={cn("block truncate font-medium", !it.name && "text-muted-foreground")}>{it.name || "Sem nome"}</span>
                                                        {it.optedOut && <span className="text-[11px] text-amber-700">Descadastrado</span>}
                                                    </span>
                                                </span>
                                                <span className="hidden truncate text-muted-foreground sm:block" title={it.phone ? `+${it.phone}` : undefined}>{maskPhone(it.phone)}</span>
                                                <span className="hidden flex-wrap gap-1 sm:flex">
                                                    {it.labels.slice(0, 2).map(l => <span key={l.id} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${l.colorHex}22`, color: l.colorHex }}>{l.name}</span>)}
                                                    {!it.labels.length && <span className="text-xs text-muted-foreground">—</span>}
                                                </span>
                                                <span onClick={e => e.stopPropagation()}>
                                                    <Popover>
                                                        <PopoverTrigger asChild><button type="button" aria-label={`Opções de ${it.name || it.phone}`} className="rounded p-1 text-muted-foreground hover:bg-muted"><MoreVertical className="h-4 w-4" /></button></PopoverTrigger>
                                                        <PopoverContent align="end" className="w-60 p-1">
                                                            <button type="button" onClick={() => setOptOut(it, !it.optedOut)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                                                                {it.optedOut ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                                                                {it.optedOut ? "Reativar para transmissões" : "Marcar como descadastrado"}
                                                            </button>
                                                        </PopoverContent>
                                                    </Popover>
                                                </span>
                                            </div>
                                        ))}
                                        {items.length < total && !audienceError && (
                                            <button type="button" onClick={() => { setLoadingAudience(true); setPage(p => p + 1); }} disabled={loadingAudience}
                                                className="flex w-full items-center justify-center gap-2 border-t border-border/70 py-2.5 text-sm text-[#00bcfe] hover:bg-muted/40">
                                                {loadingAudience && <Loader2 className="h-4 w-4 animate-spin" />}Carregar mais ({total - items.length} restantes)
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <span className="text-muted-foreground">
                                        <b className="text-foreground">{Object.keys(contacts).length}</b> contatos selecionados
                                        {total > 0 && Object.keys(contacts).length < total && <> · <button type="button" onClick={selectAllResults} className="text-[#00bcfe] hover:underline">Selecionar todos os {total} resultados</button></>}
                                    </span>
                                    {recipients.length > 0 && <button type="button" onClick={clearSelection} className="flex items-center gap-1 font-medium text-destructive hover:underline"><Trash2 className="h-4 w-4" />Limpar seleção</button>}
                                </div>
                            </div>
                        )}

                        {tab === "file" && (
                            <div className="mt-3 space-y-3">
                                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center text-sm hover:border-[#00bcfe]">
                                    <Upload className="h-6 w-6 text-[#00bcfe]" />
                                    <span className="font-medium">Escolher arquivo CSV ou TXT</span>
                                    <span className="text-xs text-muted-foreground">Um número por linha ou separados por vírgula, com DDI e DDD (ex.: 5521999998888)</span>
                                    <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
                                </label>
                                {imported && (
                                    <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
                                        <span className="truncate"><b>{imported.file}</b> · {imported.phones.length} números</span>
                                        <button type="button" onClick={() => setImported(null)} className="text-destructive" aria-label="Remover arquivo importado"><X className="h-4 w-4" /></button>
                                    </div>
                                )}
                            </div>
                        )}

                        {tab === "paste" && (
                            <div className="mt-3 space-y-2">
                                <textarea value={pasted} onChange={e => setPasted(e.target.value)} rows={7} placeholder={"5521999998888\n5511988887777"}
                                    className="w-full rounded-lg border border-border bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring/30" />
                                <p className="text-xs text-muted-foreground">{pastedPhones.length} números válidos (10 a 15 dígitos, com DDI). Duplicados são enviados uma vez só.</p>
                            </div>
                        )}
                    </section>

                    {/* Send control + when */}
                    <section className="grid gap-5 rounded-xl border border-border/80 bg-card p-5 shadow-sm md:grid-cols-[1fr_auto_minmax(0,0.8fr)]">
                        <div className="space-y-3">
                            <div className="flex items-start gap-2.5">
                                <ShieldCheck className="mt-0.5 h-5 w-5 text-[#00bcfe]" />
                                <div><h3 className="font-semibold">Controle de envio</h3><p className="text-xs text-muted-foreground">Defina o intervalo entre as mensagens</p></div>
                            </div>
                            <p className="text-sm font-medium">Intervalo entre mensagens</p>
                            <div className="flex flex-wrap gap-2">
                                <div className="flex h-11 items-center overflow-hidden rounded-xl border border-border bg-background">
                                    <button type="button" aria-label="Diminuir intervalo" disabled={intervalValue <= 1} onClick={() => setIntervalValue(v => Math.max(1, v - 1))} className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                                    <input type="number" aria-label="Intervalo" min={1} max={intervalUnit === "minutes" ? 60 : 3600} value={intervalValue}
                                        onChange={e => setIntervalValue(Math.max(1, Math.min(intervalUnit === "minutes" ? 60 : 3600, Math.round(Number(e.target.value) || 1))))}
                                        className="h-full w-16 border-x border-border bg-transparent text-center text-lg font-semibold tabular-nums outline-none" />
                                    <button type="button" aria-label="Aumentar intervalo" onClick={() => setIntervalValue(v => Math.min(intervalUnit === "minutes" ? 60 : 3600, v + 1))} className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted"><Plus className="h-4 w-4" /></button>
                                </div>
                                <select aria-label="Unidade do intervalo" value={intervalUnit} onChange={e => { const u = e.target.value as "seconds" | "minutes"; setIntervalUnit(u); if (u === "minutes") setIntervalValue(v => Math.min(v, 60)); }}
                                    className="h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm">
                                    <option value="seconds">Segundos</option><option value="minutes">Minutos</option>
                                </select>
                            </div>
                            <p className="flex items-center gap-2 rounded-lg bg-[#e0f2fe] px-3 py-1.5 text-sm font-medium text-[#00bcfe]"><Clock className="h-4 w-4" />Enviar 1 mensagem a cada {intervalText}</p>
                            <p className="text-xs text-muted-foreground">{belowFloor ? `Mínimo de ${MIN_INTERVAL_S} segundos entre mensagens.` : "Escolha segundos ou minutos."} Duração estimada: <b>{estimate === "—" ? "—" : `≈ ${estimate}`}</b></p>
                            <label className="flex items-center gap-2 text-sm"><Checkbox checked={pauseOnFailure} onCheckedChange={v => setPauseOnFailure(v === true)} />Pausar em caso de falha</label>
                            <label className="flex items-center gap-2 text-sm"><Checkbox checked={skipOptedOut} onCheckedChange={v => setSkipOptedOut(v === true)} />Excluir contatos descadastrados</label>
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" />O intervalo não garante proteção contra bloqueios.</p>
                        </div>
                        <div className="hidden w-px bg-border md:block" />
                        <div className="space-y-3" role="radiogroup" aria-label="Quando enviar">
                            <h3 className="font-semibold">Quando enviar?</h3>
                            <Radio checked={when === "now"} onSelect={() => setWhen("now")} title="Enviar agora" text="Inicia o envio imediatamente." />
                            <Radio checked={when === "schedule"} onSelect={() => setWhen("schedule")} title="Agendar" text="Escolha uma data e horário." />
                            {when === "schedule" && (
                                <div className="space-y-1 pl-8">
                                    <input type="datetime-local" value={scheduledAt} min={toLocalInput(new Date())} onChange={e => setScheduledAt(e.target.value)} aria-label="Data e horário do envio"
                                        className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm" />
                                    {scheduleInvalid && <p className="text-xs text-destructive">Escolha um horário no futuro.</p>}
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* RIGHT */}
                <div className="space-y-4">
                    <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
                        <h2 className="text-lg font-semibold">Mensagem</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">Escreva a mensagem que será enviada para os contatos selecionados.</p>
                        <div className="mt-3 overflow-hidden rounded-xl border border-border focus-within:ring-2 focus-within:ring-ring/30">
                            <textarea ref={textRef} value={message} onChange={e => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))} rows={6} placeholder={"Olá, {{nome}}!\nEscreva aqui a sua mensagem."}
                                aria-label="Mensagem" className="block w-full resize-y bg-transparent p-3 text-[15px] outline-none" />
                            {attachment && (
                                <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-muted/70 px-3 py-1.5 text-sm">
                                    <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                                    <button type="button" onClick={() => setAttachment(null)} aria-label="Remover anexo" className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                                </div>
                            )}
                            <div className="flex items-center gap-1 border-t border-border bg-muted/30 px-2 py-1.5">
                                <Popover>
                                    <PopoverTrigger asChild><button type="button" aria-label="Emoji" className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><Smile className="h-5 w-5" /></button></PopoverTrigger>
                                    <PopoverContent className="grid w-64 grid-cols-6 gap-1 p-2">
                                        {EMOJIS.map(e => <button key={e} type="button" onClick={() => insertAtCursor(e)} className="rounded p-1 text-xl hover:bg-muted">{e}</button>)}
                                    </PopoverContent>
                                </Popover>
                                <label className="cursor-pointer rounded-lg p-2 text-muted-foreground hover:bg-muted" title="Anexar imagem, vídeo, áudio ou documento">
                                    {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
                                    <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                                </label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button type="button" className="ml-1 flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"><Braces className="h-4 w-4" />Inserir variável<ChevronDown className="h-4 w-4" /></button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" className="w-56 p-1">
                                        {BROADCAST_VARIABLES.map(v => (
                                            <button key={v.key} type="button" onClick={() => insertAtCursor(`{{${v.key}}}`)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                                                {v.label}<code className="text-xs text-muted-foreground">{`{{${v.key}}}`}</code>
                                            </button>
                                        ))}
                                    </PopoverContent>
                                </Popover>
                                <span className="ml-auto text-xs tabular-nums text-muted-foreground">{message.length}/{MAX_MESSAGE_LENGTH}</span>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
                        <h2 className="text-lg font-semibold">Prévia</h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">Veja como a mensagem ficará no WhatsApp{previewContact?.name ? ` (para ${previewContact.name})` : ""}.</p>
                        <div className="mt-3 rounded-xl bg-[#EFEAE2] p-4 dark:bg-[#0B141A]" style={{ backgroundImage: "radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)", backgroundSize: "14px 14px" }}>
                            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-[#D9FDD3] px-3.5 py-2 text-[15px] text-[#111B21] shadow-sm dark:bg-[#005C4B] dark:text-[#E9EDEF]">
                                {attachment && <p className="mb-1 flex items-center gap-1.5 text-xs text-[#54656F]"><Paperclip className="h-3.5 w-3.5" />{attachment.name}</p>}
                                <p className="whitespace-pre-wrap break-words">{preview || <span className="text-[#667781]">Sua mensagem aparece aqui.</span>}</p>
                                <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#667781]">{now}<CheckCheck className="h-4 w-4 text-[#53BDEB]" /></p>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                            <Button variant="outline" onClick={sendTest} disabled={testing || (!message.trim() && !attachment)} className="h-10 rounded-xl">
                                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}Enviar teste
                            </Button>
                            <span className="text-xs text-muted-foreground">Envia a mensagem para o seu próprio WhatsApp.</span>
                        </div>
                    </section>
                </div>
            </div>

            {/* Summary bar */}
            <div className="sticky bottom-0 z-20 flex flex-col gap-3 rounded-xl border border-border/80 bg-card/95 p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.05)] backdrop-blur md:flex-row md:items-center">
                <Summary icon={Users} title={`${recipients.length} ${recipients.length === 1 ? "destinatário" : "destinatários"}`} text="Contatos selecionados" />
                <Summary icon={Send} title={session?.name || sessionId} text={session?.status === "CONNECTED" ? "Sessão ativa" : "Sessão desconectada"} />
                <Summary icon={Timer} title={`Intervalo: ${intervalText}`} text={`Enviar 1 mensagem a cada ${intervalText}`} />
                <Button onClick={() => setReviewOpen(true)} disabled={!step1 || !step2 || scheduleInvalid} className={cn("h-11 rounded-xl px-5 md:ml-auto", green)}>
                    <Send className="h-4 w-4" />Revisar transmissão<ArrowRight className="h-4 w-4" />
                </Button>
            </div>

            {/* Review (step 3) */}
            <Dialog open={reviewOpen} onOpenChange={o => { if (!starting) setReviewOpen(o); }}>
                <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Revisão e envio</DialogTitle>
                        <DialogDescription>Confira antes de enviar. As mensagens saem de verdade pelo WhatsApp da sessão ativa.</DialogDescription>
                    </DialogHeader>
                    <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                        <Row label="Campanha" value={name.trim() || "Sem nome"} />
                        <Row label="Destinatários" value={`${recipients.length}${skipOptedOut ? " (descadastrados ficam de fora)" : ""}`} />
                        <Row label="Sessão" value={session?.name || sessionId} />
                        <Row label="Intervalo" value={`1 mensagem a cada ${intervalText}`} />
                        <Row label="Duração estimada" value={estimate === "—" ? "—" : `≈ ${estimate}`} />
                        <Row label="Quando" value={when === "now" ? "Agora" : scheduleDate.toLocaleString("pt-BR")} />
                        <Row label="Se falhar" value={pauseOnFailure ? "Pausa a transmissão" : "Continua com os próximos"} />
                        {attachment && <Row label="Anexo" value={attachment.name} />}
                    </dl>
                    <div className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-sm">{preview}</div>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" />O intervalo não garante proteção contra bloqueios.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={starting}>Voltar e editar</Button>
                        <Button onClick={start} disabled={starting} className={green}>
                            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : when === "now" ? <Send className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                            {when === "now" ? `Enviar para ${recipients.length}` : "Agendar transmissão"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function Step({ n, title, text, state }: { n: number; title: string; text: string; state: "done" | "current" | "todo" }) {
    return (
        <li className="flex items-center gap-3">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                state === "todo" ? "border border-border bg-muted text-muted-foreground" : "bg-[#00bcfe] text-white")}>
                {state === "done" ? <Check className="h-4 w-4" /> : n}
            </span>
            <span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{text}</span></span>
        </li>
    );
}

function Radio({ checked, onSelect, title, text }: { checked: boolean; onSelect: () => void; title: string; text: string }) {
    return (
        <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className="flex w-full items-start gap-3 text-left focus-visible:outline-none">
            <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", checked ? "border-[#00bcfe]" : "border-border")}>
                {checked && <span className="h-2.5 w-2.5 rounded-full bg-[#00bcfe]" />}
            </span>
            <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted-foreground">{text}</span></span>
        </button>
    );
}

function Summary({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) {
    return (
        <div className="flex min-w-0 items-center gap-3 md:border-r md:border-border md:pr-4">
            <Icon className="h-6 w-6 shrink-0 text-[#00bcfe]" />
            <span className="min-w-0"><span className="block truncate text-sm font-semibold">{title}</span><span className="block truncate text-xs text-muted-foreground">{text}</span></span>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return <div className="flex justify-between gap-4 px-3 py-2"><dt className="text-muted-foreground">{label}</dt><dd className="min-w-0 break-words text-right font-medium">{value}</dd></div>;
}
