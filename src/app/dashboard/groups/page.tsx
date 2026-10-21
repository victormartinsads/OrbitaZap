"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    AlertCircle, Folder, Info, LayoutGrid, List, Loader2, LogOut, MessageCircle, MoreHorizontal, Pencil, Plus, RefreshCw, Search, ShieldCheck, SquarePen, Tag, Trash2, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/components/dashboard/session-provider";
import { SessionGuard } from "@/components/dashboard/session-guard";
import { cn } from "@/lib/utils";
import {
    AssignCategoryDialog, CategoryBadge, CategoryDialog, CategoryGlyph, GroupAvatar, GroupDetailsDialog, groupName, participantCount,
    type GroupCategory, type GroupRow,
} from "@/components/groups/group-ui";
import { BatchCategoryDialog, BatchEditDialog, BatchRemoveDialog, type RemoveMode } from "@/components/groups/group-batch";

const SCROLL_KEY = "marcflow:groups-scroll";

/** "all" | "none" | category id — one value drives both the chips and the dropdown, so they can't disagree. */
type Filter = string;

export default function GroupsPage() {
    const { sessionId } = useSession();
    return (
        <SessionGuard>
            {/* Remount per session: filters, dialogs and data never leak between sessions */}
            {sessionId ? <GroupsView key={sessionId} sessionId={sessionId} /> : null}
        </SessionGuard>
    );
}

function GroupsView({ sessionId }: { sessionId: string }) {
    const router = useRouter();
    const params = useSearchParams();
    const [groups, setGroups] = useState<GroupRow[] | null>(null);
    const [categories, setCategories] = useState<GroupCategory[]>([]);
    const [loadError, setLoadError] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    // Search, filter and view live in the URL, so coming back from a chat restores them
    const [filter, setFilter] = useState<Filter>(() => params.get("cat") || "all");
    const [search, setSearch] = useState(() => params.get("q") || "");
    const [view, setView] = useState<"grid" | "list">(() => (params.get("view") === "list" ? "list" : "grid"));
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [batch, setBatch] = useState<{ kind: "category" | "edit" | "remove"; groups: GroupRow[]; mode?: RemoveMode } | null>(null);

    const [catDialog, setCatDialog] = useState<{ editing: GroupCategory | null; thenAssign?: GroupRow } | null>(null);
    const [assignFor, setAssignFor] = useState<GroupRow | null>(null);
    const [details, setDetails] = useState<GroupRow | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    const fetchAll = useCallback(async () => {
        const [g, c] = await Promise.all([fetch(`/api/groups/${sessionId}`), fetch(`/api/groups/${sessionId}/categories`)]);
        const [gj, cj] = await Promise.all([g.json().catch(() => ({})), c.json().catch(() => ({}))]);
        if (!g.ok) throw new Error(gj.message || "Falha ao carregar os grupos");
        if (!c.ok) throw new Error(cj.message || "Falha ao carregar as categorias");
        return { groups: (gj.data || []) as GroupRow[], categories: (cj.data || []) as GroupCategory[] };
    }, [sessionId]);

    const reload = useCallback(() => {
        setRefreshing(true);
        return fetchAll()
            .then(d => { setGroups(d.groups); setCategories(d.categories); setLoadError(""); })
            .catch(e => { setLoadError((e as Error).message); toast.error((e as Error).message); })
            .finally(() => setRefreshing(false));
    }, [fetchAll]);

    useEffect(() => {
        let alive = true;
        fetchAll()
            .then(d => { if (alive) { setGroups(d.groups); setCategories(d.categories); } })
            .catch(e => { if (alive) setLoadError((e as Error).message); });
        return () => { alive = false; };
    }, [fetchAll]);

    const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
    // A link to a deleted category counts as "Sem categoria"
    const catOf = useCallback((g: GroupRow) => (g.categoryId ? catById.get(g.categoryId) ?? null : null), [catById]);
    const counts = useMemo(() => {
        const m = new Map<string, number>();
        for (const g of groups || []) { const k = catOf(g)?.id ?? "none"; m.set(k, (m.get(k) || 0) + 1); }
        return m;
    }, [groups, catOf]);

    const activeFilter = filter === "all" || filter === "none" || catById.has(filter) ? filter : "all";
    const q = search.trim().toLowerCase();
    const shown = (groups || [])
        .filter(g => activeFilter === "all" || (activeFilter === "none" ? !catOf(g) : catOf(g)?.id === activeFilter))
        .filter(g => !q || groupName(g).toLowerCase().includes(q) || g.jid.toLowerCase().includes(q));

    // Only visible groups count: a group hidden by search/filter is never acted on without being seen
    const selectedShown = shown.filter(g => selected.has(g.jid));
    const hiddenSelected = selected.size - selectedShown.length;
    const selecting = selectedShown.length > 0;
    const allShownSelected = shown.length > 0 && selectedShown.length === shown.length;
    const toggle = (jid: string) => setSelected(s => { const n = new Set(s); if (n.has(jid)) n.delete(jid); else n.add(jid); return n; });
    const selectAllShown = () => setSelected(s => new Set([...s, ...shown.map(g => g.jid)]));
    const clearSelection = () => setSelected(new Set());

    useEffect(() => {
        const qs = new URLSearchParams();
        if (search.trim()) qs.set("q", search.trim());
        if (filter !== "all") qs.set("cat", filter);
        if (view !== "grid") qs.set("view", view);
        const url = `${window.location.pathname}${qs.toString() ? `?${qs}` : ""}`;
        if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, "", url);
    }, [search, filter, view]);

    // Back from a chat: put the list where it was. Next keeps this page alive (hidden) and re-runs effects
    // when it shows again, so the stored position itself is the "pending" flag — no ref.
    useEffect(() => {
        if (groups === null) return;
        try {
            const y = Number(sessionStorage.getItem(SCROLL_KEY));
            sessionStorage.removeItem(SCROLL_KEY);
            if (y) requestAnimationFrame(() => document.querySelector("main")?.scrollTo({ top: y }));
        } catch { /* storage unavailable: start at the top */ }
    }, [groups]);

    const openChat = (g: GroupRow) => {
        try { sessionStorage.setItem(SCROLL_KEY, String(document.querySelector("main")?.scrollTop || 0)); } catch { /* ignore */ }
        router.push(`/dashboard/chat/${encodeURIComponent(g.jid)}?from=groups`);
    };
    const activate = (g: GroupRow) => (selecting ? toggle(g.jid) : openChat(g));
    const openBatch = (kind: "category" | "edit" | "remove", list: GroupRow[], mode?: RemoveMode) => setBatch({ kind, groups: list, mode });

    const setGroupCategory = (jid: string, categoryId: string | null) =>
        setGroups(gs => gs?.map(g => (g.jid === jid ? { ...g, categoryId } : g)) ?? gs);

    const removeCategoryLink = async (g: GroupRow) => {
        try {
            const res = await fetch(`/api/groups/${sessionId}/${encodeURIComponent(g.jid)}/category`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categoryId: null }) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.message || "Falha ao remover da categoria");
            setGroupCategory(g.jid, null);
            toast.success("Grupo sem categoria");
        } catch (e) { toast.error((e as Error).message); }
    };

    const menu = (g: GroupRow) => (
        <GroupMenu group={g} hasCategory={!!catOf(g)} onOpenChat={() => openChat(g)}
            onDetails={() => setDetails(g)} onChangeCategory={() => setAssignFor(g)} onRemoveCategory={() => removeCategoryLink(g)}
            onEdit={() => openBatch("edit", [g])} onLeave={() => openBatch("remove", [g], "leave")} onDelete={() => openBatch("remove", [g], "delete")} />
    );

    const filterLabel = activeFilter === "all" ? "Todas as categorias" : activeFilter === "none" ? "Sem categoria" : catById.get(activeFilter)?.name;

    return (
        <div className="mx-auto max-w-[1400px] space-y-5 pb-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-[28px]"><Users className="h-7 w-7" strokeWidth={1.8} />Grupos</h1>
                    <p className="mt-1 text-[15px] text-muted-foreground">Gerencie e organize os grupos da sessão ativa.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={reload} disabled={refreshing} className="h-10 flex-1 rounded-xl bg-card sm:flex-none">
                        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Atualizar
                    </Button>
                    <Button onClick={() => setCreateOpen(true)} className="h-10 flex-1 rounded-xl bg-[#00bcfe] text-white hover:bg-[#0084cc] sm:flex-none">
                        <Plus className="h-4 w-4" /> Criar grupo
                    </Button>
                </div>
            </div>

            {/* Categories */}
            <section className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 space-y-3">
                        <h2 className="text-[15px] font-semibold">Categorias</h2>
                        <div className="flex flex-wrap gap-2">
                            <Chip active={activeFilter === "all"} onClick={() => setFilter("all")} count={groups?.length}>Todos</Chip>
                            {categories.map(c => {
                                return (
                                    <div key={c.id} className={cn("group/chip flex items-center rounded-lg border transition", activeFilter === c.id ? "border-transparent bg-foreground text-background" : "border-border bg-card hover:bg-muted")}>
                                        <button type="button" onClick={() => setFilter(c.id)} aria-pressed={activeFilter === c.id}
                                            className="flex h-9 items-center gap-2 rounded-lg pl-3 pr-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                            <CategoryGlyph icon={c.icon} className="h-4 w-4" style={{ color: activeFilter === c.id ? undefined : c.color }} />
                                            <span className="max-w-[160px] truncate">{c.name}</span>
                                            <span className={cn("text-xs", activeFilter === c.id ? "text-background/70" : "text-muted-foreground")}>{counts.get(c.id) || 0}</span>
                                        </button>
                                        <button type="button" title={`Editar "${c.name}"`} aria-label={`Editar categoria ${c.name}`} onClick={() => setCatDialog({ editing: c })}
                                            className={cn("mr-1 rounded-md p-1 opacity-60 transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", activeFilter === c.id ? "hover:bg-background/15" : "hover:bg-background")}>
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                            <Chip active={activeFilter === "none"} onClick={() => setFilter("none")} count={counts.get("none") || 0} icon={Folder}>Sem categoria</Chip>
                        </div>
                    </div>
                    <Button variant="outline" onClick={() => setCatDialog({ editing: null })} className="h-10 shrink-0 self-start rounded-xl lg:self-end">
                        <Plus className="h-4 w-4" /> Nova categoria
                    </Button>
                </div>
            </section>

            {/* Search, category select, view toggle */}
            <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border/80 bg-card px-4 shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar grupos..." aria-label="Buscar grupos"
                        className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
                    {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca" className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
                </div>
                <div className="flex gap-2">
                    <select value={activeFilter} onChange={e => setFilter(e.target.value)} aria-label="Filtrar por categoria"
                        className="h-11 min-w-0 flex-1 rounded-xl border border-border/80 bg-card px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring/30 sm:w-56 sm:flex-none">
                        <option value="all">Todas as categorias</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value="none">Sem categoria</option>
                    </select>
                    <div className="flex rounded-xl border border-border/80 bg-card p-1 shadow-sm" role="group" aria-label="Visualização">
                        {([["grid", LayoutGrid, "Grade"], ["list", List, "Lista"]] as const).map(([v, Icon, label]) => (
                            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} title={label} aria-label={label}
                                className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition", view === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
                                <Icon className="h-4 w-4" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Selection toolbar */}
            {!!groups?.length && !!shown.length && (
                <div className={cn("sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 text-sm shadow-sm transition",
                    selecting ? "border-[#00bcfe]/30 bg-[#F1FAF5]" : "border-border/80 bg-card")}>
                    <label className="flex cursor-pointer items-center gap-2">
                        <Checkbox checked={allShownSelected ? true : selecting ? "indeterminate" : false} aria-label="Selecionar todos os grupos exibidos"
                            onCheckedChange={() => (allShownSelected ? clearSelection() : selectAllShown())} />
                        {selecting ? <span className="font-medium">{selectedShown.length} {selectedShown.length === 1 ? "selecionado" : "selecionados"}</span>
                            : <span className="text-muted-foreground">Selecionar todos os {shown.length} exibidos</span>}
                    </label>
                    {selecting && !allShownSelected && <button type="button" onClick={selectAllShown} className="text-[#00bcfe] hover:underline">Selecionar todos os {shown.length} exibidos</button>}
                    {hiddenSelected > 0 && (
                        <span className="text-xs text-muted-foreground">+{hiddenSelected} ocultos pelo filtro (não serão afetados) ·{" "}
                            <button type="button" className="underline" onClick={() => setSelected(new Set(selectedShown.map(g => g.jid)))}>descartar</button></span>
                    )}
                    {selecting && (
                        <div className="ml-auto flex flex-wrap gap-1.5">
                            <Button size="sm" variant="outline" className="h-8 bg-card" onClick={() => openBatch("category", selectedShown)}><Tag className="h-4 w-4" />Alterar categoria</Button>
                            <Button size="sm" variant="outline" className="h-8 bg-card" onClick={() => openBatch("edit", selectedShown)}><SquarePen className="h-4 w-4" />Editar grupos</Button>
                            <Button size="sm" variant="outline" className="h-8 bg-card text-destructive hover:text-destructive" onClick={() => openBatch("remove", selectedShown, "leave")}><Trash2 className="h-4 w-4" />Sair / excluir</Button>
                            <Button size="sm" variant="ghost" className="h-8" onClick={clearSelection}><X className="h-4 w-4" />Cancelar seleção</Button>
                        </div>
                    )}
                </div>
            )}

            {/* Results */}
            {groups === null && !loadError ? (
                <LoadingGrid view={view} />
            ) : loadError && groups === null ? (
                <EmptyState icon={AlertCircle} title="Não foi possível carregar os grupos" text={loadError}
                    action={<Button variant="outline" onClick={reload} disabled={refreshing}><RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />Tentar novamente</Button>} />
            ) : !groups?.length ? (
                <EmptyState icon={Users} title="Nenhum grupo nesta sessão" text="Os grupos dos quais este WhatsApp participa aparecem aqui. Clique em Atualizar ou crie um grupo." />
            ) : !shown.length ? (
                q ? <EmptyState icon={Search} title="Nenhum resultado" text={`Nada encontrado para "${search.trim()}"${activeFilter !== "all" ? ` em "${filterLabel}"` : ""}.`}
                        action={<Button variant="outline" onClick={() => setSearch("")}>Limpar busca</Button>} />
                    : <EmptyState icon={Tag} title={activeFilter === "none" ? "Todos os grupos têm categoria" : `Nenhum grupo em "${filterLabel}"`}
                        text="Use o menu de um grupo para alterar a categoria." action={<Button variant="outline" onClick={() => setFilter("all")}>Ver todos</Button>} />
            ) : view === "grid" ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {shown.map(g => (
                        <div key={g.jid} role="button" tabIndex={0} aria-label={selecting ? `Selecionar ${groupName(g)}` : `Abrir conversa de ${groupName(g)}`}
                            onClick={() => activate(g)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); activate(g); } }}
                            className={cn("relative flex min-w-0 cursor-pointer items-center gap-4 rounded-xl border bg-card p-4 pl-11 shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selected.has(g.jid) ? "border-[#00bcfe]/50 bg-[#F6FCF9] ring-1 ring-[#00bcfe]/30" : "border-border/80 hover:border-border")}>
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2" onClick={e => e.stopPropagation()}>
                                <Checkbox checked={selected.has(g.jid)} onCheckedChange={() => toggle(g.jid)} aria-label={`Selecionar ${groupName(g)}`} />
                            </span>
                            <GroupAvatar sessionId={sessionId} group={g} className="h-16 w-16 text-lg" />
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <h3 title={groupName(g)} className={cn("line-clamp-2 break-words text-[16px] font-semibold leading-snug", !g.subject?.trim() && "text-muted-foreground")}>{groupName(g)}</h3>
                                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                                    {participantCount(g)} {participantCount(g) === 1 ? "participante" : "participantes"}
                                    {g.meAdmin && <span className="inline-flex items-center gap-0.5 text-[#00bcfe]"><ShieldCheck className="h-3.5 w-3.5" />Admin</span>}
                                </p>
                                <CategoryBadge category={catOf(g)} />
                            </div>
                            <div className="self-start" onClick={e => e.stopPropagation()}>{menu(g)}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-sm">
                            <thead className="bg-muted/50 text-left text-[13px] text-muted-foreground">
                                <tr>
                                    <th className="w-10 py-3 pl-4"><span className="sr-only">Seleção</span></th>
                                    <th className="px-4 py-3 font-medium">Grupo</th>
                                    <th className="px-4 py-3 font-medium">Participantes</th>
                                    <th className="px-4 py-3 font-medium">Categoria</th>
                                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map(g => (
                                    <tr key={g.jid} className={cn("border-t border-border/70", selected.has(g.jid) ? "bg-[#F1FAF5]" : "hover:bg-muted/30")}>
                                        <td className="py-2.5 pl-4"><Checkbox checked={selected.has(g.jid)} onCheckedChange={() => toggle(g.jid)} aria-label={`Selecionar ${groupName(g)}`} /></td>
                                        <td className="px-4 py-2.5">
                                            <button type="button" onClick={() => activate(g)} title={selecting ? "Selecionar" : "Abrir conversa"} className="flex min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                                <GroupAvatar sessionId={sessionId} group={g} className="h-10 w-10 text-sm" />
                                                <span title={groupName(g)} className={cn("line-clamp-2 max-w-[380px] break-words font-medium", !g.subject?.trim() && "text-muted-foreground")}>{groupName(g)}</span>
                                                {g.meAdmin && <ShieldCheck className="h-4 w-4 shrink-0 text-[#00bcfe]" aria-label="Admin" />}
                                            </button>
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground">{participantCount(g)}</td>
                                        <td className="px-4 py-2.5"><CategoryBadge category={catOf(g)} /></td>
                                        <td className="px-4 py-2.5 text-right">{menu(g)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!!groups?.length && (
                <p className="flex items-center gap-2 border-t border-border/70 pt-4 text-[13px] text-muted-foreground">
                    <Info className="h-4 w-4" /> Clique em um grupo para abrir a conversa; use a caixa de seleção para ações em lote. {shown.length !== groups.length && `Mostrando ${shown.length} de ${groups.length}.`}
                </p>
            )}

            {/* Dialogs (mounted only while open, so each opening starts fresh) */}
            {catDialog && (
                <CategoryDialog open onOpenChange={o => { if (!o) setCatDialog(null); }} sessionId={sessionId} categories={categories}
                    editing={catDialog.editing} affectedCount={catDialog.editing ? counts.get(catDialog.editing.id) || 0 : 0}
                    onSaved={c => {
                        setCategories(cs => [...cs.filter(x => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
                        if (catDialog.thenAssign) setAssignFor({ ...catDialog.thenAssign, categoryId: c.id });
                    }}
                    onDeleted={id => {
                        setCategories(cs => cs.filter(c => c.id !== id));
                        setGroups(gs => gs?.map(g => (g.categoryId === id ? { ...g, categoryId: null } : g)) ?? gs);
                        if (filter === id) setFilter("all");
                    }} />
            )}
            {assignFor && (
                <AssignCategoryDialog key={`${assignFor.jid}:${assignFor.categoryId}`} open onOpenChange={o => { if (!o) setAssignFor(null); }} sessionId={sessionId}
                    group={assignFor} categories={categories} onAssigned={setGroupCategory}
                    onCreateNew={() => { setCatDialog({ editing: null, thenAssign: assignFor }); setAssignFor(null); }} />
            )}
            <GroupDetailsDialog group={details} category={details ? catOf(details) : null} sessionId={sessionId} onOpenChange={o => { if (!o) setDetails(null); }} />
            {createOpen && <CreateGroupDialog sessionId={sessionId} onClose={() => setCreateOpen(false)} onCreated={reload} />}
            {batch?.kind === "category" && (
                <BatchCategoryDialog sessionId={sessionId} groups={batch.groups} categories={categories} onClose={() => setBatch(null)}
                    onApplied={(jids, categoryId) => { setGroups(gs => gs?.map(g => (jids.includes(g.jid) ? { ...g, categoryId } : g)) ?? gs); clearSelection(); }} />
            )}
            {batch?.kind === "edit" && (
                <BatchEditDialog sessionId={sessionId} groups={batch.groups} onClose={() => setBatch(null)}
                    onUpdated={(jid, updated) => setGroups(gs => gs?.map(g => (g.jid === jid ? { ...g, ...updated } : g)) ?? gs)} />
            )}
            {batch?.kind === "remove" && (
                <BatchRemoveDialog sessionId={sessionId} groups={batch.groups} initialMode={batch.mode || "leave"} onClose={() => setBatch(null)}
                    onRemoved={jid => { setGroups(gs => gs?.filter(g => g.jid !== jid) ?? gs); setSelected(s => { const n = new Set(s); n.delete(jid); return n; }); }} />
            )}
        </div>
    );
}

function Chip({ active, onClick, count, icon: Icon, children }: { active: boolean; onClick: () => void; count?: number; icon?: typeof Users; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={active}
            className={cn("flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-transparent bg-foreground text-background" : "border-border bg-card hover:bg-muted")}>
            {Icon && <Icon className="h-4 w-4" />}{children}
            {count !== undefined && <span className={cn("text-xs", active ? "text-background/70" : "text-muted-foreground")}>{count}</span>}
        </button>
    );
}

function GroupMenu({ group, hasCategory, onOpenChat, onDetails, onChangeCategory, onRemoveCategory, onEdit, onLeave, onDelete }: {
    group: GroupRow; hasCategory: boolean; onOpenChat: () => void; onDetails: () => void; onChangeCategory: () => void; onRemoveCategory: () => void;
    onEdit: () => void; onLeave: () => void; onDelete: () => void;
}) {
    const [open, setOpen] = useState(false);
    const item = (Icon: typeof Users, label: string, action: () => void, danger = false) => (
        <button type="button" onClick={() => { setOpen(false); action(); }}
            className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none", danger && "text-destructive")}>
            <Icon className="h-4 w-4 shrink-0" />{label}
        </button>
    );
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Ações de ${groupName(group)}`} className="h-8 w-8 rounded-lg"><MoreHorizontal className="h-4 w-4" /></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
                {item(MessageCircle, "Abrir conversa", onOpenChat)}
                {item(Info, "Detalhes do grupo", onDetails)}
                {item(Tag, "Alterar categoria", onChangeCategory)}
                {hasCategory && item(X, "Remover da categoria", onRemoveCategory)}
                {item(SquarePen, "Editar grupo", onEdit)}
                <div className="my-1 border-t border-border" />
                {item(LogOut, "Sair do grupo", onLeave)}
                {item(Trash2, "Sair e excluir conversa", onDelete, true)}
            </PopoverContent>
        </Popover>
    );
}

function LoadingGrid({ view }: { view: "grid" | "list" }) {
    return (
        <div className={cn("grid gap-3", view === "grid" ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1")} aria-busy="true" aria-label="Carregando grupos">
            {Array.from({ length: view === "grid" ? 9 : 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl border border-border/80 bg-card p-4">
                    <div className={cn("shrink-0 animate-pulse rounded-full bg-muted", view === "grid" ? "h-16 w-16" : "h-10 w-10")} />
                    <div className="flex-1 space-y-2"><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="h-3 w-1/3 animate-pulse rounded bg-muted" /></div>
                </div>
            ))}
        </div>
    );
}

function EmptyState({ icon: Icon, title, text, action }: { icon: typeof Users; title: string; text: string; action?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <span className="rounded-full bg-muted p-3"><Icon className="h-6 w-6 text-muted-foreground" /></span>
            <p className="font-semibold">{title}</p>
            <p className="max-w-md text-sm text-muted-foreground">{text}</p>
            {action}
        </div>
    );
}

function CreateGroupDialog({ sessionId, onClose, onCreated }: { sessionId: string; onClose: () => void; onCreated: () => void }) {
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const create = async () => {
        if (!name.trim() || busy) return;
        setBusy(true);
        try {
            const res = await fetch(`/api/groups/${sessionId}/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, subject: name.trim() }) });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.message || "Falha ao criar o grupo");
            toast.success("Grupo criado");
            onCreated();
            onClose();
        } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
    };
    return (
        <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
            <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Criar grupo</DialogTitle>
                    <DialogDescription>Cria um grupo novo no WhatsApp da sessão ativa.</DialogDescription>
                </DialogHeader>
                <form className="space-y-1.5" onSubmit={e => { e.preventDefault(); create(); }}>
                    <Label htmlFor="new-group">Nome do grupo</Label>
                    <Input id="new-group" autoFocus value={name} maxLength={100} onChange={e => setName(e.target.value)} placeholder="Meu novo grupo" />
                </form>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
                    <Button onClick={create} disabled={busy || !name.trim()} className="bg-[#00bcfe] text-white hover:bg-[#0084cc]">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Criar grupo</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
