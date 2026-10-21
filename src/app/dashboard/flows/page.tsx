"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Copy, FileText, Loader2, MoreVertical, Pause, Pencil, Play, Plus, Search, SlidersHorizontal, Trash2, Workflow, type LucideIcon } from "lucide-react";
import { useSession } from "@/components/dashboard/session-provider";
import { SessionGuard } from "@/components/dashboard/session-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface FlowRow {
    id: string;
    name: string;
    status: "DRAFT" | "ACTIVE" | "PAUSED";
    publishedAt: string | null;
    updatedAt: string;
    activeRuns: number;
    triggers: { type: string; keyword: string | null }[];
}

const PER_PAGE = 10;

const STATUS: Record<FlowRow["status"], { label: string; className: string }> = {
    DRAFT: { label: "Rascunho", className: "bg-muted text-foreground/80" },
    ACTIVE: { label: "Ativo", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    PAUSED: { label: "Pausado", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
};

function triggerSummary(t: FlowRow["triggers"]): string {
    if (!t.length) return "Sem gatilho";
    return t.map(x => x.type === "KEYWORD" ? `"${x.keyword}"` : x.type === "FIRST_MESSAGE" ? "Primeira mensagem" : "Qualquer mensagem").join(", ");
}

export default function FlowsPage() {
    const { sessionId } = useSession();
    const router = useRouter();
    const [flows, setFlows] = useState<FlowRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [toDelete, setToDelete] = useState<FlowRow | null>(null);
    const [tab, setTab] = useState<"all" | "ACTIVE" | "DRAFT">("all");
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<"recent" | "oldest" | "name">("recent");
    const [page, setPage] = useState(1);

    const load = useCallback(async () => {
        if (!sessionId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/flows/${sessionId}`);
            const json = await res.json();
            if (res.ok) setFlows(json.data);
            else toast.error(json.message || "Falha ao carregar os fluxos");
        } catch {
            toast.error("Falha ao carregar os fluxos");
        } finally {
            setLoading(false);
        }
    }, [sessionId]);

    useEffect(() => { load(); }, [load]);

    const call = async (url: string, init: RequestInit, success: string) => {
        const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(json.message || "Algo deu errado"); return null; }
        toast.success(success);
        return json.data;
    };

    const create = async () => {
        if (!name.trim()) return toast.error("Informe o nome do fluxo");
        setBusy(true);
        const flow = await call(`/api/flows/${sessionId}`, { method: "POST", body: JSON.stringify({ name }) }, "Fluxo criado");
        setBusy(false);
        if (flow) router.push(`/dashboard/flows/${flow.id}`);
    };

    const toggle = async (f: FlowRow) => {
        const status = f.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
        if (await call(`/api/flows/${sessionId}/${f.id}`, { method: "PATCH", body: JSON.stringify({ status }) }, status === "ACTIVE" ? "Fluxo ativado" : "Fluxo pausado")) load();
    };

    const duplicate = async (f: FlowRow) => {
        if (await call(`/api/flows/${sessionId}/${f.id}/duplicate`, { method: "POST" }, "Fluxo duplicado")) load();
    };

    const remove = async () => {
        if (!toDelete) return;
        if (await call(`/api/flows/${sessionId}/${toDelete.id}`, { method: "DELETE" }, "Fluxo excluído") !== null) load();
        setToDelete(null);
    };

    const counts = { all: flows.length, ACTIVE: flows.filter(f => f.status === "ACTIVE").length, DRAFT: flows.filter(f => f.status === "DRAFT").length };
    const q = search.trim().toLowerCase();
    const shown = flows
        .filter(f => tab === "all" || f.status === tab)
        .filter(f => !q || f.name.toLowerCase().includes(q))
        .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "pt-BR")
            : (new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) * (sort === "oldest" ? -1 : 1));
    const pages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
    const current = Math.min(page, pages);
    const pageRows = shown.slice((current - 1) * PER_PAGE, current * PER_PAGE);
    const openCreate = () => { setName(""); setCreateOpen(true); };

    return (
        <SessionGuard>
            <div className="mx-auto max-w-[1400px] space-y-7 px-0 py-2 lg:px-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Automação</p>
                        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-[40px] sm:leading-[1.1]">Fluxos de conversa</h1>
                        <p className="mt-2 text-[17px] text-muted-foreground">Crie jornadas automáticas e organize suas conversas.</p>
                    </div>
                    <Button onClick={openCreate} className="h-12 rounded-xl bg-gradient-to-b from-[#12704A] to-[#0B5236] px-6 text-[16px] font-semibold text-white shadow-md hover:brightness-110">
                        <Plus className="h-5 w-5" /> Criar fluxo
                    </Button>
                </div>

                <div className="grid grid-cols-1 divide-y divide-border/70 rounded-2xl border border-border/70 bg-card shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <Stat icon={Workflow} label="Total de fluxos" value={counts.all} tone="green" />
                    <Stat icon={Play} label="Ativos" value={counts.ACTIVE} tone="green" />
                    <Stat icon={FileText} label="Rascunhos" value={counts.DRAFT} tone="gray" />
                </div>

                <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-7">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="flex gap-2 overflow-x-auto border-b border-border/70">
                            {([["all", "Todos", counts.all], ["ACTIVE", "Ativos", counts.ACTIVE], ["DRAFT", "Rascunhos", counts.DRAFT]] as const).map(([key, label, n]) => (
                                <button key={key} type="button" onClick={() => { setTab(key); setPage(1); }}
                                    className={`-mb-px whitespace-nowrap border-b-2 px-3 pb-3 text-[16px] font-medium transition-colors ${tab === key ? "border-[#12A35E] text-[#00bcfe]" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                                    {label} ({n})
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 flex-1 items-center gap-3 rounded-xl border border-border/70 px-4 lg:w-[330px] lg:flex-none">
                                <Search className="h-5 w-5 text-muted-foreground" />
                                <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar fluxo..."
                                    className="h-full flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button type="button" title="Ordenar" className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 hover:bg-muted/50"><SlidersHorizontal className="h-5 w-5" /></button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-52 p-1">
                                    <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Ordenar por</p>
                                    {([["recent", "Mais recentes"], ["oldest", "Mais antigos"], ["name", "Nome (A–Z)"]] as const).map(([key, label]) => (
                                        <button key={key} type="button" onClick={() => setSort(key)}
                                            className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted ${sort === key ? "font-medium text-[#00bcfe]" : ""}`}>
                                            {label}{sort === key && <Check className="h-4 w-4" />}
                                        </button>
                                    ))}
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="mt-5 overflow-hidden rounded-xl border border-border/70">
                        {loading && !flows.length ? (
                            <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
                        ) : !flows.length ? (
                            <div className="flex flex-col items-center gap-3 p-12 text-center">
                                <div className="rounded-2xl bg-[#e0f2fe] p-4"><Workflow className="h-8 w-8 text-[#00bcfe]" /></div>
                                <p className="font-medium">Nenhum fluxo ainda</p>
                                <p className="max-w-sm text-sm text-muted-foreground">Crie o primeiro fluxo para responder seus contatos automaticamente, como um atendente que segue um roteiro.</p>
                                <Button onClick={openCreate}><Plus className="h-4 w-4" /> Criar fluxo</Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="h-12 pl-4 text-[14px] font-normal">Nome</TableHead>
                                        <TableHead className="text-[14px] font-normal">Status</TableHead>
                                        <TableHead className="hidden text-[14px] font-normal md:table-cell">Gatilho</TableHead>
                                        <TableHead className="hidden text-[14px] font-normal sm:table-cell">Em andamento</TableHead>
                                        <TableHead className="hidden text-[14px] font-medium text-foreground lg:table-cell">Última atualização</TableHead>
                                        <TableHead className="pr-4 text-right text-[14px] font-normal">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {!pageRows.length && (
                                        <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhum fluxo encontrado.</TableCell></TableRow>
                                    )}
                                    {pageRows.map(f => {
                                        const d = new Date(f.updatedAt);
                                        return (
                                            <TableRow key={f.id}>
                                                <TableCell className="py-4 pl-4">
                                                    <Link href={`/dashboard/flows/${f.id}`} className="flex items-center gap-4">
                                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e0f2fe]"><Workflow className="h-5 w-5 text-[#00bcfe]" /></span>
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-[17px] font-semibold text-foreground">{f.name}</span>
                                                            <span className="block text-[14px] text-muted-foreground">Fluxo de conversa</span>
                                                        </span>
                                                    </Link>
                                                </TableCell>
                                                <TableCell><span className={`rounded-full px-4 py-1.5 text-[14px] ${STATUS[f.status].className}`}>{STATUS[f.status].label}</span></TableCell>
                                                <TableCell className="hidden max-w-xs truncate text-[15px] text-muted-foreground md:table-cell">{triggerSummary(f.triggers)}</TableCell>
                                                <TableCell className="hidden text-[15px] text-muted-foreground sm:table-cell">{f.activeRuns}</TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    <span className="block text-[15px]">{d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" }).replace(/ de /g, " ")}</span>
                                                    <span className="block text-[13px] text-muted-foreground">{d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                                                </TableCell>
                                                <TableCell className="pr-4">
                                                    <div className="flex justify-end gap-2">
                                                        <Button asChild variant="outline" className="h-11 rounded-xl px-4 text-[15px] font-medium">
                                                            <Link href={`/dashboard/flows/${f.id}`}><Pencil className="h-4 w-4" /> <span className="hidden sm:inline">Abrir editor</span></Link>
                                                        </Button>
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <Button variant="outline" size="icon" title="Mais ações" className="h-11 w-11 rounded-xl"><MoreVertical className="h-4 w-4" /></Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent align="end" className="w-44 p-1">
                                                                {f.publishedAt && (
                                                                    <MenuItem icon={f.status === "ACTIVE" ? Pause : Play} onClick={() => toggle(f)}>{f.status === "ACTIVE" ? "Pausar" : "Ativar"}</MenuItem>
                                                                )}
                                                                <MenuItem icon={Copy} onClick={() => duplicate(f)}>Duplicar</MenuItem>
                                                                <MenuItem icon={Trash2} danger onClick={() => setToDelete(f)}>Excluir</MenuItem>
                                                            </PopoverContent>
                                                        </Popover>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </div>

                    {!!flows.length && (
                        <div className="mt-5 flex items-center justify-between">
                            <p className="text-[15px] text-muted-foreground">{shown.length} {shown.length === 1 ? "fluxo" : "fluxos"}</p>
                            <div className="flex items-center gap-2">
                                <PageBtn disabled={current <= 1} onClick={() => setPage(current - 1)}><ChevronLeft className="h-4 w-4" /></PageBtn>
                                {Array.from({ length: pages }, (_, i) => i + 1).map(n => (
                                    <PageBtn key={n} active={n === current} onClick={() => setPage(n)}>{n}</PageBtn>
                                ))}
                                <PageBtn disabled={current >= pages} onClick={() => setPage(current + 1)}><ChevronRight className="h-4 w-4" /></PageBtn>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Criar fluxo</DialogTitle></DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="flow-name">Nome do fluxo</Label>
                        <Input id="flow-name" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Atendimento inicial" onKeyDown={e => e.key === "Enter" && create()} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
                        <Button onClick={create} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Criar e abrir</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir fluxo</AlertDialogTitle>
                        <AlertDialogDescription>
                            O fluxo &quot;{toDelete?.name}&quot; e o histórico de execuções serão apagados. Conversas em andamento param. Essa ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </SessionGuard>
    );
}

function Stat({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: "green" | "gray" }) {
    return (
        <div className="flex items-center gap-6 px-7 py-6">
            <span className={`flex h-16 w-16 items-center justify-center rounded-xl ${tone === "green" ? "bg-[#e0f2fe] text-[#00bcfe]" : "bg-muted text-foreground/70"}`}>
                <Icon className="h-7 w-7" strokeWidth={1.8} />
            </span>
            <div>
                <p className="text-[15px] text-muted-foreground">{label}</p>
                <p className="mt-1 text-[28px] font-bold leading-none">{value}</p>
            </div>
        </div>
    );
}

function MenuItem({ icon: Icon, onClick, danger, children }: { icon: LucideIcon; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted ${danger ? "text-destructive" : ""}`}>
            <Icon className="h-4 w-4" />{children}
        </button>
    );
}

function PageBtn({ active, disabled, onClick, children }: { active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type="button" disabled={disabled} onClick={onClick}
            className={`flex h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-[15px] transition-colors disabled:opacity-40 ${active ? "border-transparent bg-[#e0f2fe] font-semibold text-[#00bcfe]" : "border-border/70 hover:bg-muted/50"}`}>
            {children}
        </button>
    );
}
