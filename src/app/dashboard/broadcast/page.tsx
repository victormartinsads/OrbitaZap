"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle, CalendarClock, CheckCircle2, Eye, FileText, History, Loader2, Pause, Play, Radio, RefreshCw, Send, Square, Trash2, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/components/dashboard/session-provider";
import { SessionGuard } from "@/components/dashboard/session-guard";
import { useSocket } from "@/components/chat/socket-context";
import { NewBroadcast, formatDuration, type BroadcastDraft } from "@/components/broadcast/new-broadcast";
import { cn } from "@/lib/utils";

type Status = "scheduled" | "running" | "paused" | "completed" | "cancelled";
interface Progress { broadcastId: string; status: Status; total: number; sent: number; failed: number; skipped?: number; progress?: number; current?: string | null; reason?: string; delay?: number; name?: string | null }
interface Log {
    id: string; name: string | null; message: string; total: number; sent: number; failed: number; status: Status; delay: number;
    startedAt: string; completedAt: string | null; scheduledAt: string | null;
    recipients?: { id: string; jid: string; status: string; error: string | null; sentAt: string | null }[];
}

const STATUS: Record<Status, { label: string; className: string }> = {
    scheduled: { label: "Agendada", className: "bg-sky-500/10 text-sky-700" },
    running: { label: "Em andamento", className: "bg-[#e0f2fe] text-[#00bcfe]" },
    paused: { label: "Pausada", className: "bg-amber-500/10 text-amber-700" },
    completed: { label: "Concluída", className: "bg-muted text-foreground/80" },
    cancelled: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};
const green = "bg-[#00bcfe] text-white hover:bg-[#0084cc]";
const formatJid = (jid: string) => jid.replace("@s.whatsapp.net", "").replace("@lid", " (LID)").replace("@g.us", " (grupo)");
const formatTime = (ts: string) => new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function BroadcastPage() {
    const { sessionId } = useSession();
    return <SessionGuard>{sessionId ? <BroadcastView key={sessionId} sessionId={sessionId} /> : null}</SessionGuard>;
}

function BroadcastView({ sessionId }: { sessionId: string }) {
    const [tab, setTab] = useState<"new" | "drafts" | "history">("new");
    const [formKey, setFormKey] = useState(0);
    const [openDraft, setOpenDraft] = useState<BroadcastDraft | null>(null);
    const [live, setLive] = useState<Progress | null>(null);
    const [busy, setBusy] = useState(false);
    const [drafts, setDrafts] = useState<BroadcastDraft[] | null>(null);
    const [history, setHistory] = useState<Log[] | null>(null);
    const [detail, setDetail] = useState<Log | null>(null);
    const { getSocket, joinSession } = useSocket();

    const loadDrafts = useCallback(() => fetch(`/api/messages/${sessionId}/broadcast/drafts`).then(r => r.json()).then(j => setDrafts(j.data || [])).catch(() => setDrafts([])), [sessionId]);
    const loadHistory = useCallback(() => fetch(`/api/messages/${sessionId}/broadcast/history?limit=30`).then(r => r.json()).then(j => setHistory(j.data || [])).catch(() => setHistory([])), [sessionId]);
    useEffect(() => { loadDrafts(); loadHistory(); }, [loadDrafts, loadHistory]);

    // Live progress from the server queue
    useEffect(() => {
        const socket = getSocket();
        if (!socket) return;
        const onConnect = () => joinSession(sessionId);
        if (socket.connected) joinSession(sessionId);
        socket.on("connect", onConnect);
        const onProgress = (p: Progress) => {
            setLive(p);
            if (p.status === "paused" && p.reason) toast.warning(`Transmissão pausada: ${p.reason}`);
            if (p.status === "completed") toast.success(`Transmissão concluída: ${p.sent} enviada(s)${p.failed ? `, ${p.failed} com falha` : ""}.`);
            if (p.status !== "running") loadHistory();
        };
        socket.on("broadcast.progress", onProgress);
        return () => { socket.off("connect", onConnect); socket.off("broadcast.progress", onProgress); };
    }, [sessionId, getSocket, joinSession, loadHistory]);

    const control = async (id: string, action: "pause" | "resume" | "cancel") => {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/messages/${sessionId}/broadcast/${id}/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.message || "Não foi possível alterar a transmissão");
            toast.success(json.message);
            loadHistory();
        } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    };

    const openDetail = async (log: Log) => {
        setDetail(log);
        const res = await fetch(`/api/messages/${sessionId}/broadcast/history/${log.id}`).then(r => r.json()).catch(() => null);
        if (res?.data) setDetail(res.data);
    };

    const deleteDraft = async (d: BroadcastDraft) => {
        const res = await fetch(`/api/messages/${sessionId}/broadcast/drafts/${d.id}`, { method: "DELETE" });
        if (res.ok) { toast.success("Rascunho excluído"); setDrafts(ds => ds?.filter(x => x.id !== d.id) ?? ds); }
        else toast.error("Não foi possível excluir o rascunho");
    };

    const active = history?.find(h => h.status === "running" || h.status === "paused");
    const shownLive: Progress | null = live ?? (active ? { broadcastId: active.id, status: active.status, total: active.total, sent: active.sent, failed: active.failed, delay: active.delay, name: active.name } : null);

    return (
        <div className="mx-auto max-w-[1400px] space-y-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-[34px]">Transmissão</h1>
                <p className="mt-1 text-[15px] text-muted-foreground">Crie campanhas e converse com os contatos certos.</p>
            </div>

            <div className="flex w-fit gap-1 rounded-xl border border-border/80 bg-card p-1 shadow-sm">
                {([["new", "Nova transmissão", Send], ["drafts", "Rascunhos", FileText], ["history", "Histórico", History]] as const).map(([k, l, Icon]) => (
                    <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
                        className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition", tab === k ? "bg-background text-[#00bcfe] shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}>
                        <Icon className="h-4 w-4" />{l}{k === "drafts" && drafts?.length ? <span className="text-xs text-muted-foreground">({drafts.length})</span> : null}
                    </button>
                ))}
            </div>

            {shownLive && (shownLive.status === "running" || shownLive.status === "paused" || (live && live.broadcastId === shownLive.broadcastId)) && (
                <LiveCard p={shownLive} busy={busy} onControl={control} onClose={() => setLive(null)} />
            )}

            {tab === "new" && (
                <NewBroadcast key={formKey} sessionId={sessionId} draft={openDraft}
                    onDraftSaved={loadDrafts}
                    onStarted={() => { setOpenDraft(null); setFormKey(k => k + 1); loadDrafts(); loadHistory(); }} />
            )}

            {tab === "drafts" && (
                <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
                    <h2 className="text-lg font-semibold">Rascunhos</h2>
                    <p className="text-sm text-muted-foreground">Campanhas salvas que ainda não foram enviadas.</p>
                    <div className="mt-4 space-y-2">
                        {drafts === null ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                            : !drafts.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum rascunho. Use “Salvar rascunho” na nova transmissão.</p>
                            : drafts.map(d => (
                                <div key={d.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
                                    <FileText className="hidden h-8 w-8 shrink-0 text-muted-foreground sm:block" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{d.name || "Sem nome"}</p>
                                        <p className="truncate text-sm text-muted-foreground">{d.message || "Sem mensagem"}</p>
                                        <p className="text-xs text-muted-foreground">{d.recipients.length} destinatários · salvo em {formatTime(d.updatedAt)}{d.scheduledAt ? ` · agendado para ${formatTime(d.scheduledAt)}` : ""}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="sm" className={green} onClick={() => { setOpenDraft(d); setFormKey(k => k + 1); setTab("new"); }}>Abrir</Button>
                                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteDraft(d)} aria-label="Excluir rascunho"><Trash2 className="h-4 w-4" /></Button>
                                    </div>
                                </div>
                            ))}
                    </div>
                </section>
            )}

            {tab === "history" && (
                <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div><h2 className="text-lg font-semibold">Histórico</h2><p className="text-sm text-muted-foreground">Transmissões enviadas, agendadas e em andamento.</p></div>
                        <Button variant="outline" size="sm" onClick={loadHistory}><RefreshCw className="h-4 w-4" />Atualizar</Button>
                    </div>
                    <div className="mt-4 space-y-2">
                        {history === null ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                            : !history.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma transmissão ainda.</p>
                            : history.map(log => (
                                <div key={log.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
                                    <StatusIcon status={log.status} failed={log.failed} />
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-center gap-2"><span className="truncate font-medium">{log.name || log.message || "Sem nome"}</span><span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS[log.status]?.className)}>{STATUS[log.status]?.label ?? log.status}</span></p>
                                        <p className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-[#00bcfe]" />{log.sent}</span>
                                            <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-destructive" />{log.failed}</span>
                                            <span>{log.total} destinatários</span>
                                            <span>{log.status === "scheduled" && log.scheduledAt ? `agendada para ${formatTime(log.scheduledAt)}` : formatTime(log.startedAt)}</span>
                                            <span>1 a cada {formatDuration(log.delay / 1000)}</span>
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {log.status === "running" && <Button size="sm" variant="outline" disabled={busy} onClick={() => control(log.id, "pause")}><Pause className="h-4 w-4" />Pausar</Button>}
                                        {log.status === "paused" && <Button size="sm" className={green} disabled={busy} onClick={() => control(log.id, "resume")}><Play className="h-4 w-4" />Retomar</Button>}
                                        {(log.status === "running" || log.status === "paused" || log.status === "scheduled") && (
                                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => control(log.id, "cancel")}><Square className="h-4 w-4" />Cancelar</Button>
                                        )}
                                        <Button size="sm" variant="ghost" onClick={() => openDetail(log)}><Eye className="h-4 w-4" />Detalhes</Button>
                                    </div>
                                </div>
                            ))}
                    </div>
                </section>
            )}

            <Dialog open={!!detail} onOpenChange={o => { if (!o) setDetail(null); }}>
                <DialogContent className="grid max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-hidden sm:max-w-2xl">
                    {detail && <>
                        <DialogHeader>
                            <DialogTitle>{detail.name || "Detalhes da transmissão"}</DialogTitle>
                            <DialogDescription>{STATUS[detail.status]?.label} · {detail.total} destinatários · 1 mensagem a cada {formatDuration(detail.delay / 1000)}</DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <Stat value={detail.sent} label="Enviadas" className="text-[#00bcfe]" />
                            <Stat value={detail.failed} label="Falhas" className="text-destructive" />
                            <Stat value={detail.total - detail.sent - detail.failed} label="Pendentes / ignoradas" />
                        </div>
                        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-sm">{detail.message}</p>
                        <div className="min-h-0 overflow-y-auto">
                            {detail.recipients?.map(r => (
                                <div key={r.id} className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 text-xs last:border-0">
                                    <span className="truncate font-mono">{formatJid(r.jid)}</span>
                                    <span className="flex shrink-0 items-center gap-2">
                                        {r.error && <span className="max-w-[220px] truncate text-destructive" title={r.error}>{r.error}</span>}
                                        <span className={cn("rounded px-1.5 py-0.5 font-medium", r.status === "sent" ? "bg-[#e0f2fe] text-[#00bcfe]" : r.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}>
                                            {({ sent: "enviada", failed: "falhou", pending: "pendente", skipped: "ignorada" } as Record<string, string>)[r.status] ?? r.status}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function LiveCard({ p, busy, onControl, onClose }: { p: Progress; busy: boolean; onControl: (id: string, a: "pause" | "resume" | "cancel") => void; onClose: () => void }) {
    const done = p.sent + p.failed + (p.skipped || 0);
    const pct = p.progress ?? (p.total ? Math.round((done / p.total) * 100) : 0);
    const remaining = Math.max(0, p.total - done);
    const open = p.status === "running" || p.status === "paused";
    return (
        <section className={cn("rounded-xl border p-4 shadow-sm", p.status === "paused" ? "border-amber-300/70 bg-amber-50/60 dark:bg-amber-500/5" : open ? "border-[#00bcfe]/30 bg-[#F4FBF7] dark:bg-[#00bcfe]/5" : "border-border bg-card")}>
            <div className="flex flex-wrap items-center gap-3">
                <StatusIcon status={p.status} failed={p.failed} />
                <div className="min-w-0 flex-1">
                    <p className="font-semibold">{STATUS[p.status]?.label}{p.name ? `: ${p.name}` : ""}</p>
                    <p className="text-xs text-muted-foreground">
                        {done} de {p.total} processados · {p.sent} enviadas · {p.failed} falhas{p.skipped ? ` · ${p.skipped} ignoradas` : ""}
                        {p.status === "running" && p.delay ? ` · restante ≈ ${formatDuration(Math.max(0, remaining - 1) * p.delay / 1000)}` : ""}
                    </p>
                </div>
                <div className="flex gap-2">
                    {p.status === "running" && <Button size="sm" variant="outline" disabled={busy} onClick={() => onControl(p.broadcastId, "pause")}><Pause className="h-4 w-4" />Pausar</Button>}
                    {p.status === "paused" && <Button size="sm" className={green} disabled={busy} onClick={() => onControl(p.broadcastId, "resume")}><Play className="h-4 w-4" />Retomar</Button>}
                    {open && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => onControl(p.broadcastId, "cancel")}><Square className="h-4 w-4" />Cancelar</Button>}
                    {!open && <Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>}
                </div>
            </div>
            <Progress value={pct} className="mt-3 h-2" />
        </section>
    );
}

function StatusIcon({ status, failed }: { status: Status; failed: number }) {
    const c = "h-8 w-8 shrink-0";
    if (status === "running") return <Radio className={cn(c, "animate-pulse text-[#00bcfe]")} />;
    if (status === "paused") return <Pause className={cn(c, "text-amber-500")} />;
    if (status === "scheduled") return <CalendarClock className={cn(c, "text-sky-600")} />;
    if (status === "cancelled") return <Square className={cn(c, "text-muted-foreground")} />;
    return failed ? <AlertTriangle className={cn(c, "text-amber-500")} /> : <CheckCircle2 className={cn(c, "text-[#00bcfe]")} />;
}

function Stat({ value, label, className }: { value: number; label: string; className?: string }) {
    return <div className="rounded-lg bg-muted/50 p-3"><div className={cn("text-xl font-bold", className)}>{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}


