"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
    AlertTriangle, CheckCircle2, Download, FileArchive, Info, ListChecks, Loader2, Mic, Pause, Play, RefreshCw, Search, Square, Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/components/dashboard/session-provider";
import { SessionGuard } from "@/components/dashboard/session-guard";
import { cn } from "@/lib/utils";

type JobStatus = "running" | "paused" | "completed" | "completed_with_errors" | "cancelled";
interface Job { id: string; status: JobStatus; phase: "scan" | "backfill" | "media" | "done"; includeMedia: boolean; note: string | null; selected: number | null }
interface Stats { chats: number; messages: number; pendingChats: number; errorChats: number; media: { saved: number; pending: number; skipped: number; unavailable: number; error: number } }
interface Summary { job: Job | null; stats: Stats | null; connected: boolean }
interface ChatRow { jid: string; name: string | null; isGroup: boolean; messages: number; audios: number; first: string | null; last: string | null }
interface Part { part: number; label: string; chats: number; messages: number; files: number; bytes: number }
interface Missing { chat: string; when: string | null; what: string }

const STATUS: Record<JobStatus, { label: string; className: string }> = {
    running: { label: "Preparando", className: "bg-[#e0f2fe] text-[#00bcfe]" },
    paused: { label: "Pausada", className: "bg-amber-500/10 text-amber-700" },
    completed: { label: "Pronta", className: "bg-[#e0f2fe] text-[#00bcfe]" },
    completed_with_errors: { label: "Pronta com erros", className: "bg-amber-500/10 text-amber-700" },
    cancelled: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};
const PHASE = { scan: "Reunindo as mensagens já salvas", backfill: "Buscando o histórico antigo no celular", media: "Baixando os áudios", done: "Finalizado" };
const green = "bg-[#00bcfe] text-white hover:bg-[#0084cc]";
const card = "rounded-xl border border-border/80 bg-card p-5 shadow-sm";
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");
const fmtBytes = (n: number) => (n < 1024 ** 2 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`);
const phoneOf = (jid: string) => (jid.endsWith("@g.us") ? `Grupo ${jid.split("@")[0]}` : "+" + jid.split("@")[0]);

export default function ArchivePage() {
    const { sessionId } = useSession();
    return <SessionGuard>{sessionId ? <ExportView key={sessionId} sessionId={sessionId} /> : null}</SessionGuard>;
}

function ExportView({ sessionId }: { sessionId: string }) {
    const base = `/api/messages/${sessionId}/archive`;
    const [summary, setSummary] = useState<Summary | null>(null);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [includeMedia, setIncludeMedia] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => fetch(base).then(r => r.json()).then(j => j.data && setSummary(j.data)).catch(() => undefined), [base]);
    useEffect(() => { load(); }, [load]);
    const job = summary?.job ?? null;
    const open = job?.status === "running" || job?.status === "paused";
    useEffect(() => {
        if (job?.status !== "running") return;
        const t = setInterval(load, 2500);
        return () => clearInterval(t);
    }, [job?.status, load]);

    const call = async (url: string, body: unknown) => {
        if (busy) return;
        setBusy(true);
        try {
            const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.message || "Não foi possível concluir a ação");
            toast.success(json.message);
            await load();
        } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    };

    return (
        <div className="mx-auto max-w-[1400px] space-y-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-[34px]">Exportar conversas</h1>
                <p className="mt-1 text-[15px] text-muted-foreground">Selecione várias conversas, ou todas, e baixe um ZIP com o histórico em texto e os áudios.</p>
            </div>

            <section className="flex gap-3 rounded-xl border border-sky-300/60 bg-sky-50/70 p-4 text-sm dark:bg-sky-500/5">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <div className="space-y-1 text-muted-foreground">
                    <p className="font-medium text-foreground">O que dá para recuperar</p>
                    <p>O WhatsApp não permite baixar tudo de uma vez. Ao exportar, o sistema junta o que já tem salvo e pede ao celular as mensagens mais antigas, conversa por conversa (o celular precisa estar ligado e com internet). Não há garantia de receber o histórico inteiro.</p>
                    <p>Áudios e arquivos antigos podem não estar mais disponíveis nos servidores do WhatsApp. Eles aparecem marcados no texto, e o que faltou é listado aqui e no arquivo RELATORIO.txt do ZIP.</p>
                </div>
            </section>

            {summary && !summary.connected && (
                <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" />Esta sessão não está conectada: só dá para exportar o que já está salvo no sistema. Conecte o WhatsApp para buscar o histórico mais antigo.</p>
            )}

            {job && <JobPanel base={base} job={job} stats={summary!.stats} busy={busy} onCall={call} />}

            <ChatList base={base} picked={picked} setPicked={setPicked} includeMedia={includeMedia} setIncludeMedia={setIncludeMedia} locked={open} busy={busy}
                onExport={() => call(`${base}/jobs`, { jids: [...picked], includeMedia })} />
        </div>
    );
}

function Stat({ value, label, className }: { value: number; label: string; className?: string }) {
    return <div className="rounded-lg bg-muted/50 p-3"><div className={cn("text-xl font-bold", className)}>{value.toLocaleString("pt-BR")}</div><div className="text-xs text-muted-foreground">{label}</div></div>;
}

function JobPanel({ base, job, stats, busy, onCall }: { base: string; job: Job; stats: Stats | null; busy: boolean; onCall: (url: string, body: unknown) => void }) {
    const [plan, setPlan] = useState<{ parts: Part[]; complete: boolean } | null>(null);
    const [missing, setMissing] = useState<{ total: number; items: Missing[] } | null>(null);
    const [showMissing, setShowMissing] = useState(false);
    const open = job.status === "running" || job.status === "paused";
    const errors = (stats?.media.error ?? 0) + (stats?.errorChats ?? 0);

    // The download list is read when the job stops moving (not on every progress tick)
    useEffect(() => {
        if (job.status === "running") return;
        fetch(`${base}/jobs/${job.id}/plan?tz=${encodeURIComponent(tz())}`).then(r => r.json()).then(j => setPlan(j.data ?? null)).catch(() => setPlan(null));
    }, [base, job.id, job.status, stats?.messages]);
    const openMissing = () => {
        setShowMissing(true); setMissing(null);
        fetch(`${base}/jobs/${job.id}/missing?tz=${encodeURIComponent(tz())}`).then(r => r.json()).then(j => setMissing(j.data ?? { total: 0, items: [] })).catch(() => setMissing({ total: 0, items: [] }));
    };
    const ctl = (action: string) => onCall(`${base}/jobs/${job.id}/control`, { action });
    const dl = (part: number) => `${base}/jobs/${job.id}/download?part=${part}&tz=${encodeURIComponent(tz())}`;

    const pct = !stats?.chats || job.phase === "scan" ? 0 : job.phase === "done" ? 100 : Math.round(((stats.chats - stats.pendingChats - stats.errorChats) / stats.chats) * 100);
    const attention = job.status === "paused" || job.status === "completed_with_errors";
    const unavailable = stats?.media.unavailable ?? 0;

    return (
        <section className={cn("rounded-xl border p-4 shadow-sm", attention ? "border-amber-300/70 bg-amber-50/60 dark:bg-amber-500/5" : job.status === "running" ? "border-[#00bcfe]/30 bg-[#F4FBF7] dark:bg-[#00bcfe]/5" : "border-border bg-card")}>
            <div className="flex flex-wrap items-center gap-3">
                {job.status === "running" ? <Loader2 className="h-7 w-7 animate-spin text-[#00bcfe]" /> : job.status === "completed" ? <CheckCircle2 className="h-7 w-7 text-[#00bcfe]" /> : job.status === "cancelled" ? <Square className="h-7 w-7 text-muted-foreground" /> : <AlertTriangle className="h-7 w-7 text-amber-500" />}
                <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">Exportação de {job.selected ?? "todas as"} conversa(s)<span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS[job.status].className)}>{STATUS[job.status].label}</span></p>
                    <p className="text-xs text-muted-foreground">{job.status === "running" ? PHASE[job.phase] : job.note ?? PHASE[job.phase]}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {job.status === "running" && <Button size="sm" variant="outline" disabled={busy} onClick={() => ctl("pause")}><Pause className="h-4 w-4" />Pausar</Button>}
                    {job.status === "paused" && <Button size="sm" className={green} disabled={busy} onClick={() => ctl("resume")}><Play className="h-4 w-4" />Retomar</Button>}
                    {(job.status === "completed_with_errors" || (job.status === "paused" && errors > 0)) && <Button size="sm" variant="outline" disabled={busy} onClick={() => ctl("retry")}><RefreshCw className="h-4 w-4" />Tentar novamente os erros ({errors})</Button>}
                    {open && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => ctl("cancel")}><Square className="h-4 w-4" />Cancelar</Button>}
                </div>
            </div>
            <Progress value={pct} className="mt-3 h-2" />
            {stats && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                    <Stat value={stats.chats} label="Conversas encontradas" />
                    <Stat value={stats.messages} label="Mensagens salvas" />
                    <Stat value={stats.media.saved} label="Arquivos baixados" className="text-[#00bcfe]" />
                    <Stat value={unavailable} label="Indisponíveis no WhatsApp" />
                    <Stat value={errors} label="Com erro (repetíveis)" className={errors ? "text-destructive" : undefined} />
                </div>
            )}
            {job.status === "running" && !!stats?.pendingChats && <p className="mt-2 text-xs text-muted-foreground">{stats.pendingChats} conversa(s) ainda com histórico antigo a pedir ao celular. Pode demorar; você pode pausar e retomar, ou baixar o que já foi salvo.</p>}

            {job.status !== "running" && plan && plan.parts.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
                    {!plan.complete && <p className="flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" />A preparação não terminou: o ZIP sai marcado como INCOMPLETO, com o que falta listado no relatório.</p>}
                    {plan.parts.map(p => (
                        <div key={p.part} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-2.5 text-sm">
                            <FileArchive className="h-5 w-5 text-[#00bcfe]" />
                            <div className="min-w-0 flex-1"><p className="font-medium">{p.label}{plan.complete ? "" : " (incompleto)"}</p><p className="text-xs text-muted-foreground">{p.chats} conversa(s) · {p.messages.toLocaleString("pt-BR")} mensagens · {p.files} arquivo(s) · ≈ {fmtBytes(p.bytes)}</p></div>
                            <Button asChild size="sm" className={plan.complete ? green : ""} variant={plan.complete ? "default" : "outline"}><a href={dl(p.part)}><Download className="h-4 w-4" />{plan.complete ? "Baixar ZIP" : "Baixar o que já está salvo"}</a></Button>
                        </div>
                    ))}
                    {(unavailable > 0 || errors > 0 || !plan.complete) && <Button size="sm" variant="ghost" onClick={openMissing}><ListChecks className="h-4 w-4" />Ver o que faltou</Button>}
                </div>
            )}

            <Dialog open={showMissing} onOpenChange={setShowMissing}>
                <DialogContent className="grid max-h-[85vh] grid-cols-[minmax(0,1fr)] overflow-hidden sm:max-w-2xl">
                    <DialogHeader><DialogTitle>O que faltou nesta exportação</DialogTitle><DialogDescription>{missing ? `${missing.total} item(ns).${missing.total > missing.items.length ? ` Mostrando os ${missing.items.length} primeiros; a lista completa está no RELATORIO.txt do ZIP.` : ""}` : "Carregando…"}</DialogDescription></DialogHeader>
                    <div className="min-h-0 space-y-1 overflow-y-auto">
                        {!missing ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> : missing.items.map((m, i) => (
                            <p key={i} className="border-b border-border/60 py-1.5 text-xs last:border-0"><span className="font-medium">{m.chat}</span>{m.when ? <span className="text-muted-foreground"> · {m.when}</span> : null}<br /><span className="text-muted-foreground">{m.what}</span></p>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    );
}

function ChatList({ base, picked, setPicked, includeMedia, setIncludeMedia, locked, busy, onExport }: {
    base: string; picked: Set<string>; setPicked: (f: (s: Set<string>) => Set<string>) => void; includeMedia: boolean; setIncludeMedia: (v: boolean) => void; locked: boolean; busy: boolean; onExport: () => void;
}) {
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState<{ total: number; pageSize: number; chats: ChatRow[] } | null>(null);
    const [allCount, setAllCount] = useState<number | null>(null);
    const [selectingAll, setSelectingAll] = useState(false);
    const timer = useRef<NodeJS.Timeout | null>(null);

    const load = useCallback(() => fetch(`${base}/chats?q=${encodeURIComponent(q)}&page=${page}&pageSize=50`).then(r => r.json()).then(j => { if (j.data) { setData(j.data); if (!q) setAllCount(j.data.total); } }).catch(() => undefined), [base, q, page]);
    useEffect(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(load, 250); return () => { if (timer.current) clearTimeout(timer.current); }; }, [load]);

    const total = data?.total ?? 0;
    const rows = data?.chats ?? [];
    const pageAll = rows.length > 0 && rows.every(r => picked.has(r.jid));
    const toggle = (jid: string) => setPicked(s => { const n = new Set(s); if (n.has(jid)) n.delete(jid); else n.add(jid); return n; });
    // "Selecionar todas" = every conversation of the account, not just this page or this search
    const selectAll = async () => {
        setSelectingAll(true);
        try { const j = await fetch(`${base}/chats?ids=1`).then(r => r.json()); setPicked(() => new Set<string>(j.data.jids)); }
        catch { toast.error("Não foi possível selecionar todas as conversas"); } finally { setSelectingAll(false); }
    };
    const everything = allCount !== null && allCount > 0 && picked.size === allCount;
    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    return (
        <section className={card}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div><h2 className="text-lg font-semibold">Conversas</h2><p className="text-sm text-muted-foreground">{data ? `${total.toLocaleString("pt-BR")} conversa(s) ${q ? "encontrada(s)" : "nesta conta"}` : "Carregando…"} · <span className="font-medium text-foreground">{picked.size.toLocaleString("pt-BR")} selecionada(s)</span></p></div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label className="flex items-start gap-3 text-sm">
                        <Switch checked={includeMedia} onCheckedChange={setIncludeMedia} disabled={locked} className="mt-0.5" />
                        <span><span className="font-medium">Incluir fotos, vídeos e documentos</span><br /><span className="text-xs text-muted-foreground">Desligado: só textos e áudios (as demais mídias ficam marcadas no texto).</span></span>
                    </label>
                    <Button className={green} disabled={busy || locked || !picked.size} onClick={onExport}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}Exportar selecionadas{picked.size ? ` (${picked.size.toLocaleString("pt-BR")})` : ""}
                    </Button>
                </div>
            </div>
            {locked && <p className="mt-2 text-xs text-muted-foreground">Há uma exportação em andamento. Termine, pause ou cancele para começar outra.</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Buscar por nome ou número" className="pl-9" /></div>
                <Button variant="outline" disabled={selectingAll || !allCount} onClick={selectAll}>{selectingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}Selecionar todas{allCount ? ` (${allCount.toLocaleString("pt-BR")})` : ""}</Button>
                {picked.size > 0 && <Button variant="ghost" onClick={() => setPicked(() => new Set())}>Limpar seleção</Button>}
            </div>
            {everything && <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">Todas as {allCount!.toLocaleString("pt-BR")} conversas desta conta estão selecionadas.</p>}
            <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                        <tr className="border-b border-border">
                            <th className="w-10 py-2"><Checkbox checked={pageAll} onCheckedChange={v => setPicked(s => { const n = new Set(s); rows.forEach(r => (v ? n.add(r.jid) : n.delete(r.jid))); return n; })} aria-label="Selecionar a página" /></th>
                            <th className="py-2">Conversa</th><th className="py-2 text-right">Mensagens</th><th className="py-2 text-right">Áudios</th><th className="py-2 pl-4">Período</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data === null ? <tr><td colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></td></tr>
                            : !rows.length ? <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">{q ? "Nenhuma conversa encontrada." : "Esta conta ainda não tem conversas salvas. Conecte o WhatsApp e aguarde a sincronização."}</td></tr>
                            : rows.map(r => (
                                <tr key={r.jid} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30" onClick={() => toggle(r.jid)}>
                                    <td className="py-2" onClick={e => e.stopPropagation()}><Checkbox checked={picked.has(r.jid)} onCheckedChange={() => toggle(r.jid)} aria-label={`Selecionar ${r.name || r.jid}`} /></td>
                                    <td className="py-2">
                                        <p className="flex items-center gap-1.5 font-medium">{r.isGroup && <Users className="h-3.5 w-3.5 text-muted-foreground" />}{r.name || phoneOf(r.jid)}</p>
                                        {r.name && <p className="text-xs text-muted-foreground">{phoneOf(r.jid)}</p>}
                                    </td>
                                    <td className="py-2 text-right tabular-nums">{r.messages.toLocaleString("pt-BR")}</td>
                                    <td className="py-2 text-right tabular-nums">{r.audios ? <span className="inline-flex items-center gap-1 text-[#00bcfe]"><Mic className="h-3 w-3" />{r.audios}</span> : <span className="text-muted-foreground">—</span>}</td>
                                    <td className="whitespace-nowrap py-2 pl-4 text-xs text-muted-foreground">{fmtDate(r.first)} a {fmtDate(r.last)}</td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
            {pages > 1 && (
                <div className="mt-3 flex items-center justify-between text-sm">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                    <span className="text-muted-foreground">Página {page} de {pages}</span>
                    <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                </div>
            )}
        </section>
    );
}
