"use client";

import { createElement, useEffect, useRef, useState } from "react";
import {
    BookOpen, Briefcase, Building2, Camera, Car, Check, Copy, DollarSign, Folder, Gamepad2, GraduationCap, Heart, Home, Loader2,
    Megaphone, Music, Plane, Plus, Search, ShieldCheck, ShoppingBag, Star, Tag, Trash2, User, Users, Wrench, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CATEGORY_COLORS, CATEGORY_ICONS, categoryKey, cleanCategoryName, type CategoryIcon } from "@/modules/groups/categories";

export interface GroupCategory { id: string; name: string; color: string; icon: string | null }
export interface GroupRow {
    id: string; jid: string; subject: string | null; participants?: unknown[]; meAdmin?: boolean; categoryId: string | null;
    description?: string | null; announce?: boolean | null; restrict?: boolean | null;
}

export const ICONS: Record<CategoryIcon, LucideIcon> = {
    Briefcase, Users, User, Home, GraduationCap, Folder, Tag, Star, Heart, ShoppingBag,
    Megaphone, Building2, Car, Gamepad2, Music, Camera, Plane, Wrench, DollarSign, BookOpen,
};
export const iconOf = (key: string | null | undefined): LucideIcon => (key && (ICONS as Record<string, LucideIcon>)[key]) || Tag;

/** Icon of a category by key (falls back to a tag). */
export function CategoryGlyph({ icon, className, style }: { icon: string | null | undefined; className?: string; style?: React.CSSProperties }) {
    return createElement(iconOf(icon), { className, style });
}

export const groupName = (g: Pick<GroupRow, "subject">) => g.subject?.trim() || "Grupo sem nome";
export const participantCount = (g: GroupRow) => (Array.isArray(g.participants) ? g.participants.length : 0);

/** Same group, same color: hash of the stable id picks from the palette. */
function colorFor(id: string) {
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

function initials(name: string) {
    const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || "").slice(0, 2)).toUpperCase();
}

/** Real group photo through the cached avatar route, requested only when the card scrolls into view. */
export function GroupAvatar({ sessionId, group, className = "h-14 w-14" }: { sessionId: string; group: GroupRow; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { rootMargin: "200px" });
        obs.observe(el);
        return () => obs.disconnect();
    }, []);
    const name = groupName(group);
    const color = colorFor(group.jid);
    const ini = group.subject?.trim() ? initials(name) : "";
    return (
        <Avatar ref={ref} className={cn("shrink-0", className)}>
            {visible && <AvatarImage src={`/api/chat/${sessionId}/${encodeURIComponent(group.jid)}/avatar`} alt="" className="object-cover" />}
            <AvatarFallback className="font-semibold text-white" style={{ background: color }}>
                {ini || <Users className="h-1/2 w-1/2" />}
            </AvatarFallback>
        </Avatar>
    );
}

export function CategoryBadge({ category }: { category: GroupCategory | null | undefined }) {
    if (!category) {
        return <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"><Folder className="h-3.5 w-3.5 shrink-0" />Sem categoria</span>;
    }
    return (
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: `${category.color}1A`, color: category.color }}>
            <CategoryGlyph icon={category.icon} className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{category.name}</span>
        </span>
    );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: init?.body ? { "Content-Type": "application/json" } : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.status === false) throw new Error(json.message || "Falha na requisição");
    return json.data as T;
}

/** Create / edit a category. Edit mode also offers deleting it (with the number of affected groups). */
export function CategoryDialog({ open, onOpenChange, sessionId, categories, editing, affectedCount, onSaved, onDeleted }: {
    open: boolean; onOpenChange: (o: boolean) => void; sessionId: string; categories: GroupCategory[];
    editing?: GroupCategory | null; affectedCount?: number;
    onSaved: (c: GroupCategory) => void; onDeleted?: (id: string) => void;
}) {
    const [name, setName] = useState(editing?.name ?? "");
    const [color, setColor] = useState(editing?.color ?? CATEGORY_COLORS[0]);
    const [icon, setIcon] = useState<string | null>(editing?.icon ?? null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [touched, setTouched] = useState(false);

    const key = categoryKey(name);
    const error = !key ? "Informe o nome da categoria"
        : ["todos", "sem categoria"].includes(key) ? "Esse nome é reservado pelo sistema"
        : categories.some(c => c.id !== editing?.id && categoryKey(c.name) === key) ? "Já existe uma categoria com esse nome" : "";

    const save = async () => {
        setTouched(true);
        if (error || saving) return;
        setSaving(true);
        try {
            const body = JSON.stringify({ name: cleanCategoryName(name), color, icon });
            const saved = editing
                ? await api<GroupCategory>(`/api/groups/${sessionId}/categories/${editing.id}`, { method: "PATCH", body })
                : await api<GroupCategory>(`/api/groups/${sessionId}/categories`, { method: "POST", body });
            toast.success(editing ? "Categoria salva" : "Categoria criada");
            onSaved(saved);
            onOpenChange(false);
        } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
    };

    const remove = async () => {
        if (!editing || saving) return;
        setSaving(true);
        try {
            await api(`/api/groups/${sessionId}/categories/${editing.id}`, { method: "DELETE" });
            toast.success("Categoria excluída");
            onDeleted?.(editing.id);
            setConfirmDelete(false);
            onOpenChange(false);
        } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={o => { if (!saving) onOpenChange(o); }}>
                <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
                        <DialogDescription>Organização interna do MarcFlow. Nada muda no WhatsApp.</DialogDescription>
                    </DialogHeader>
                    <form className="space-y-5" onSubmit={e => { e.preventDefault(); save(); }}>
                        <div className="space-y-1.5">
                            <Label htmlFor="cat-name">Nome</Label>
                            <Input id="cat-name" autoFocus value={name} maxLength={40} onChange={e => setName(e.target.value)} onBlur={() => setTouched(true)}
                                placeholder="Ex.: Trabalho" aria-invalid={touched && !!error} aria-describedby="cat-name-error" />
                            {touched && error && <p id="cat-name-error" className="text-xs text-destructive">{error}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label>Cor</Label>
                            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Cor">
                                {CATEGORY_COLORS.map(c => (
                                    <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
                                        className={cn("flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", color === c && "ring-2 ring-foreground/60")}
                                        style={{ background: c }}>
                                        {color === c && <Check className="h-4 w-4 text-white" />}
                                    </button>
                                ))}
                                <label className="relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-muted-foreground" title="Outra cor">
                                    <Plus className="h-3.5 w-3.5" />
                                    <input type="color" value={color} onChange={e => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Outra cor" />
                                </label>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Ícone <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                            <div className="grid grid-cols-10 gap-1.5" role="radiogroup" aria-label="Ícone">
                                {CATEGORY_ICONS.map(k => {
                                    const Icon = ICONS[k];
                                    const on = icon === k;
                                    return (
                                        <button key={k} type="button" role="radio" aria-checked={on} aria-label={k} onClick={() => setIcon(on ? null : k)}
                                            className={cn("flex aspect-square items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-transparent" : "border-border text-muted-foreground hover:bg-muted")}
                                            style={on ? { background: `${color}1A`, color } : undefined}>
                                            <Icon className="h-4 w-4" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                            Prévia: <CategoryBadge category={{ id: "preview", name: cleanCategoryName(name) || "Categoria", color, icon }} />
                        </div>
                        <DialogFooter className="gap-2 sm:justify-between">
                            {editing ? (
                                <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                                    <Trash2 className="h-4 w-4" /> Excluir
                                </Button>
                            ) : <span />}
                            <div className="flex gap-2">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
                                <Button type="submit" disabled={saving || (touched && !!error)} className="bg-[#00bcfe] text-white hover:bg-[#0084cc]">
                                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Salvar" : "Criar categoria"}
                                </Button>
                            </div>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={confirmDelete} onOpenChange={o => { if (!saving) setConfirmDelete(o); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir a categoria &quot;{editing?.name}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {affectedCount
                                ? `${affectedCount} ${affectedCount === 1 ? "grupo vai ficar" : "grupos vão ficar"} em "Sem categoria". Os grupos não são apagados do WhatsApp.`
                                : "Nenhum grupo está nesta categoria."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
                        <Button onClick={remove} disabled={saving} className="bg-destructive text-white hover:bg-destructive/90">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />}Excluir categoria
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/** Picks the category of one group: search, list, "Sem categoria" and a shortcut to create a new one. */
export function AssignCategoryDialog({ open, onOpenChange, sessionId, group, categories, onAssigned, onCreateNew }: {
    open: boolean; onOpenChange: (o: boolean) => void; sessionId: string; group: GroupRow | null; categories: GroupCategory[];
    onAssigned: (jid: string, categoryId: string | null) => void; onCreateNew: () => void;
}) {
    const [q, setQ] = useState("");
    const [selected, setSelected] = useState<string | null>(group?.categoryId ?? null);
    const [saving, setSaving] = useState(false);
    const shown = categories.filter(c => categoryKey(c.name).includes(categoryKey(q)));

    const save = async () => {
        if (!group || saving) return;
        setSaving(true);
        try {
            await api(`/api/groups/${sessionId}/${encodeURIComponent(group.jid)}/category`, { method: "PUT", body: JSON.stringify({ categoryId: selected }) });
            toast.success(selected ? "Categoria alterada" : "Grupo sem categoria");
            onAssigned(group.jid, selected);
            onOpenChange(false);
        } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
    };

    const option = (id: string | null, label: React.ReactNode) => (
        <button key={id ?? "none"} type="button" role="radio" aria-checked={selected === id} onClick={() => setSelected(id)}
            className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected === id && "bg-[#e0f2fe]")}>
            {label}{selected === id && <Check className="h-4 w-4 shrink-0 text-[#00bcfe]" />}
        </button>
    );

    return (
        <Dialog open={open} onOpenChange={o => { if (!saving) onOpenChange(o); }}>
            <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Alterar categoria</DialogTitle>
                    <DialogDescription className="line-clamp-2">{group ? groupName(group) : ""}</DialogDescription>
                </DialogHeader>
                <div className="flex items-center gap-2 rounded-lg border border-border px-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar categoria..." aria-label="Buscar categoria"
                        className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                </div>
                <div className="max-h-72 space-y-0.5 overflow-y-auto" role="radiogroup" aria-label="Categorias">
                    {option(null, <CategoryBadge category={null} />)}
                    {shown.map(c => option(c.id, <CategoryBadge category={c} />))}
                    {!shown.length && q && <p className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhuma categoria encontrada.</p>}
                </div>
                <button type="button" onClick={onCreateNew} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[#00bcfe] hover:bg-[#e0f2fe]">
                    <Plus className="h-4 w-4" /> Nova categoria
                </button>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
                    <Button onClick={save} disabled={saving || selected === (group?.categoryId ?? null)} className="bg-[#00bcfe] text-white hover:bg-[#0084cc]">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** Full name, technical id (copiable), participants, admin and category. */
export function GroupDetailsDialog({ group, category, sessionId, onOpenChange }: {
    group: GroupRow | null; category: GroupCategory | null | undefined; sessionId: string; onOpenChange: (o: boolean) => void;
}) {
    const copy = async () => {
        if (!group) return;
        try { await navigator.clipboard.writeText(group.jid); toast.success("Identificador copiado"); }
        catch { toast.error("Não foi possível copiar"); }
    };
    return (
        <Dialog open={!!group} onOpenChange={onOpenChange}>
            <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
                {group && (
                    <>
                        <DialogHeader className="items-center text-center sm:text-center">
                            <GroupAvatar sessionId={sessionId} group={group} className="h-20 w-20 text-2xl" />
                            <DialogTitle className="mt-2 break-words">{groupName(group)}</DialogTitle>
                            <DialogDescription>{participantCount(group)} participantes</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2">
                                <span className="text-muted-foreground">Categoria</span><CategoryBadge category={category} />
                            </div>
                            {group.meAdmin && (
                                <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2">
                                    <span className="text-muted-foreground">Seu papel</span>
                                    <span className="inline-flex items-center gap-1 font-medium text-[#00bcfe]"><ShieldCheck className="h-4 w-4" />Admin</span>
                                </div>
                            )}
                            <div className="space-y-1 rounded-lg bg-muted/60 px-3 py-2">
                                <span className="text-muted-foreground">Identificador do grupo</span>
                                <div className="flex items-center gap-2">
                                    <code className="min-w-0 flex-1 break-all text-xs">{group.jid}</code>
                                    <Button size="sm" variant="outline" onClick={copy}><Copy className="h-3.5 w-3.5" />Copiar</Button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
