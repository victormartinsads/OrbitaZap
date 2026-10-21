"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleSlash, Loader2, RotateCcw, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CategoryBadge, groupName, type GroupCategory, type GroupRow } from "./group-ui";

// ---------------------------------------------------------------- batch runner

type Status = "pending" | "running" | "ok" | "error" | "skipped";
interface ItemResult { status: Status; message?: string }
type Outcome = { status: "ok" | "error" | "skipped"; message?: string };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Runs one request per group, in order, with a pause between WhatsApp writes; one failure doesn't stop the rest. */
function useBatchRunner() {
    const [results, setResults] = useState<Record<string, ItemResult>>({});
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [running, setRunning] = useState(false);
    const lock = useRef(false); // blocks a second run started before the state update lands

    const run = async (jids: string[], worker: (jid: string) => Promise<Outcome>, gapMs: number) => {
        if (lock.current || !jids.length) return;
        lock.current = true;
        setRunning(true);
        setProgress({ done: 0, total: jids.length });
        setResults(r => ({ ...r, ...Object.fromEntries(jids.map(j => [j, { status: "pending" as Status }])) }));
        for (let i = 0; i < jids.length; i++) {
            const jid = jids[i];
            setResults(r => ({ ...r, [jid]: { status: "running" } }));
            let out: Outcome;
            try { out = await worker(jid); } catch (e) { out = { status: "error", message: (e as Error).message || "Falha inesperada" }; }
            setResults(r => ({ ...r, [jid]: out }));
            setProgress({ done: i + 1, total: jids.length });
            if (gapMs && i < jids.length - 1 && out.status !== "skipped") await sleep(gapMs);
        }
        lock.current = false;
        setRunning(false);
    };
    return { results, progress, running, run };
}

async function postJson(url: string, method: string, body: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json.status !== false, json };
}

function ProgressBar({ done, total, verb }: { done: number; total: number; verb: string }) {
    return (
        <div className="space-y-1.5" role="status" aria-live="polite">
            <p className="text-sm font-medium">{verb} {Math.min(done + 1, total)} de {total} {total === 1 ? "grupo" : "grupos"}…</p>
            <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-[#00bcfe] transition-all" style={{ width: `${(done / total) * 100}%` }} /></div>
        </div>
    );
}

function ResultsList({ groups, results }: { groups: GroupRow[]; results: Record<string, ItemResult> }) {
    const icon = (s: Status) =>
        s === "ok" ? <CheckCircle2 className="h-4 w-4 text-[#00bcfe]" /> :
        s === "error" ? <XCircle className="h-4 w-4 text-destructive" /> :
        s === "skipped" ? <CircleSlash className="h-4 w-4 text-amber-600" /> :
        s === "running" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> :
        <span className="block h-4 w-4 rounded-full border border-border" />;
    return (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {groups.map(g => {
                const r = results[g.jid];
                return (
                    <li key={g.jid} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                        <span className="mt-0.5 shrink-0">{icon(r?.status ?? "pending")}</span>
                        <span className="min-w-0 flex-1">
                            <span className="block break-words font-medium" title={groupName(g)}>{groupName(g)}</span>
                            {r?.message && <span className={cn("block text-xs", r.status === "error" ? "text-destructive" : "text-muted-foreground")}>{r.message}</span>}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

function Summary({ groups, results }: { groups: GroupRow[]; results: Record<string, ItemResult> }) {
    const count = (s: Status) => groups.filter(g => results[g.jid]?.status === s).length;
    const ok = count("ok"), err = count("error"), skip = count("skipped");
    return (
        <p className="text-sm">
            <span className="font-medium text-[#00bcfe]">{ok} concluído{ok === 1 ? "" : "s"}</span>
            {err > 0 && <> · <span className="font-medium text-destructive">{err} com falha</span></>}
            {skip > 0 && <> · <span className="font-medium text-amber-700">{skip} ignorado{skip === 1 ? "" : "s"}</span></>}
        </p>
    );
}

function AffectedList({ groups }: { groups: GroupRow[] }) {
    return (
        <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg bg-muted/60 px-3 py-2 text-sm">
            {groups.map(g => <li key={g.jid} className="truncate" title={groupName(g)}>• {groupName(g)}</li>)}
        </ul>
    );
}

// ---------------------------------------------------------------- category

export function BatchCategoryDialog({ sessionId, groups, categories, onClose, onApplied }: {
    sessionId: string; groups: GroupRow[]; categories: GroupCategory[]; onClose: () => void; onApplied: (jids: string[], categoryId: string | null) => void;
}) {
    const [selected, setSelected] = useState<string | null | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    const apply = async () => {
        if (selected === undefined || saving) return;
        setSaving(true);
        const { ok, json } = await postJson(`/api/groups/${sessionId}/categories/assign`, "PUT", { jids: groups.map(g => g.jid), categoryId: selected });
        setSaving(false);
        if (!ok) { toast.error(json.message || "Falha ao alterar a categoria"); return; }
        toast.success(json.message);
        onApplied(groups.map(g => g.jid), selected);
        onClose();
    };
    const option = (id: string | null, label: React.ReactNode) => (
        <button key={id ?? "none"} type="button" role="radio" aria-checked={selected === id} onClick={() => setSelected(id)}
            className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected === id && "bg-[#e0f2fe]")}>
            {label}{selected === id && <Check className="h-4 w-4 text-[#00bcfe]" />}
        </button>
    );
    return (
        <Dialog open onOpenChange={o => { if (!o && !saving) onClose(); }}>
            <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Alterar categoria de {groups.length} {groups.length === 1 ? "grupo" : "grupos"}</DialogTitle>
                    <DialogDescription>Organização interna do MarcFlow. Nada muda no WhatsApp.</DialogDescription>
                </DialogHeader>
                <AffectedList groups={groups} />
                <div className="max-h-60 space-y-0.5 overflow-y-auto" role="radiogroup" aria-label="Nova categoria">
                    {option(null, <span className="text-sm">Remover categoria <span className="text-muted-foreground">(Sem categoria)</span></span>)}
                    {categories.map(c => option(c.id, <CategoryBadge category={c} />))}
                    {!categories.length && <p className="px-3 py-2 text-sm text-muted-foreground">Nenhuma categoria criada ainda. Use “Nova categoria” na tela de Grupos.</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button onClick={apply} disabled={saving || selected === undefined} className="bg-[#00bcfe] text-white hover:bg-[#0084cc]">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}Aplicar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------- edit

type Tri = "keep" | "all" | "admins";
type DescMode = "keep" | "set" | "clear";
const EPHEMERAL: { value: string; label: string }[] = [
    { value: "keep", label: "Não alterar" }, { value: "0", label: "Desativadas" }, { value: "86400", label: "24 horas" },
    { value: "604800", label: "7 dias" }, { value: "7776000", label: "90 dias" },
];

interface Plan { group: GroupRow; payload: Record<string, unknown>; changes: string[]; skipped: string[] }

export function BatchEditDialog({ sessionId, groups, onClose, onUpdated }: {
    sessionId: string; groups: GroupRow[]; onClose: () => void;
    onUpdated: (jid: string, updated: Partial<Pick<GroupRow, "subject" | "description" | "announce" | "restrict">>) => void;
}) {
    const [step, setStep] = useState<"edit" | "review" | "run">("edit");
    const [renameOn, setRenameOn] = useState(false);
    const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(groups.map(g => [g.jid, g.subject ?? ""])));
    const [descMode, setDescMode] = useState<DescMode>("keep");
    const [descText, setDescText] = useState("");
    const [announce, setAnnounce] = useState<Tri>("keep");
    const [restrict, setRestrict] = useState<Tri>("keep");
    const [ephemeral, setEphemeral] = useState("keep");
    const runner = useBatchRunner();

    const nonAdmin = groups.filter(g => !g.meAdmin);
    const emptyName = renameOn && groups.some(g => !names[g.jid]?.trim());
    const nothing = !renameOn && descMode === "keep" && announce === "keep" && restrict === "keep" && ephemeral === "keep";

    const plans: Plan[] = groups.map(group => {
        const canInfo = !!group.meAdmin || !group.restrict;
        const canSettings = !!group.meAdmin;
        const payload: Record<string, unknown> = {}, changes: string[] = [], skipped: string[] = [];
        const newName = names[group.jid]?.trim();
        if (renameOn && newName && newName !== (group.subject ?? "").trim()) {
            if (canInfo) { payload.subject = newName; changes.push(`Nome: “${groupName(group)}” → “${newName}”`); } else skipped.push("Nome (só admins podem editar)");
        }
        if (descMode !== "keep") {
            if (canInfo) { payload.description = descMode === "clear" ? null : descText; changes.push(descMode === "clear" ? "Descrição: limpar" : "Descrição: substituir pelo novo texto"); }
            else skipped.push("Descrição (só admins podem editar)");
        }
        const setting = (v: Tri, key: string, label: string, adminsText: string) => {
            if (v === "keep") return;
            if (canSettings) { payload[key] = v === "admins"; changes.push(`${label}: ${v === "admins" ? adminsText : "todos os participantes"}`); }
            else skipped.push(`${label} (requer admin)`);
        };
        setting(announce, "announce", "Quem envia mensagens", "somente admins");
        setting(restrict, "restrict", "Quem edita os dados do grupo", "somente admins");
        if (ephemeral !== "keep") {
            if (canSettings) { payload.ephemeral = Number(ephemeral); changes.push(`Mensagens temporárias: ${EPHEMERAL.find(e => e.value === ephemeral)?.label.toLowerCase()}`); }
            else skipped.push("Mensagens temporárias (requer admin)");
        }
        return { group, payload, changes, skipped };
    });
    const planOf = (jid: string) => plans.find(p => p.group.jid === jid)!;

    const worker = async (jid: string): Promise<Outcome> => {
        const plan = planOf(jid);
        if (!Object.keys(plan.payload).length) return { status: "skipped", message: plan.skipped.length ? `Ignorado: ${plan.skipped.join(", ")}` : "Nada a alterar" };
        const { ok, json } = await postJson(`/api/groups/${sessionId}/${encodeURIComponent(jid)}/update`, "POST", plan.payload);
        if (json.data?.updated && Object.keys(json.data.updated).length) onUpdated(jid, json.data.updated);
        if (!ok) return { status: "error", message: json.message || "Falha ao atualizar" };
        const failed = (json.data?.results || []).filter((r: { ok: boolean }) => !r.ok) as { field: string; error: string }[];
        const label: Record<string, string> = { subject: "nome", description: "descrição", announce: "quem envia", restrict: "quem edita", ephemeral: "temporárias" };
        if (failed.length) return { status: "error", message: failed.map(f => `${label[f.field] || f.field}: ${f.error}`).join(" · ") };
        return { status: "ok", message: plan.skipped.length ? `Aplicado; ignorado: ${plan.skipped.join(", ")}` : "Alterações aplicadas" };
    };
    const failedJids = groups.filter(g => runner.results[g.jid]?.status === "error").map(g => g.jid);
    const finished = step === "run" && !runner.running && runner.progress.done === runner.progress.total;

    const triSelect = (id: string, label: string, value: Tri, set: (v: Tri) => void, adminsLabel: string) => (
        <div className="space-y-1">
            <Label htmlFor={id}>{label} <span className="text-xs font-normal text-muted-foreground">(requer admin)</span></Label>
            <select id={id} value={value} onChange={e => set(e.target.value as Tri)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm">
                <option value="keep">Não alterar</option><option value="all">Todos os participantes</option><option value="admins">{adminsLabel}</option>
            </select>
        </div>
    );

    return (
        <Dialog open onOpenChange={o => { if (!o && !runner.running) onClose(); }}>
            <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Editar {groups.length} {groups.length === 1 ? "grupo" : "grupos"} no WhatsApp</DialogTitle>
                    <DialogDescription>Só os campos que você escolher serão alterados; o resto fica como está.</DialogDescription>
                </DialogHeader>

                {step === "edit" && (
                    <div className="space-y-5">
                        {nonAdmin.length > 0 && (
                            <div className="flex gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>Você não é admin de {nonAdmin.length} {nonAdmin.length === 1 ? "grupo" : "grupos"}: nesses, configurações não podem ser alteradas, e nome/descrição só se o grupo permitir que todos editem.</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium">
                                <input type="checkbox" checked={renameOn} onChange={e => setRenameOn(e.target.checked)} className="h-4 w-4 accent-[#00bcfe]" />
                                Alterar nomes <span className="font-normal text-muted-foreground">(um campo por grupo)</span>
                            </label>
                            {renameOn && (
                                <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
                                    {groups.map(g => (
                                        <div key={g.jid} className="space-y-1">
                                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <span className="truncate" title={groupName(g)}>{groupName(g)}</span>
                                                {!g.meAdmin && g.restrict && <span className="shrink-0 text-amber-700">· só admins</span>}
                                            </span>
                                            <Input value={names[g.jid] ?? ""} maxLength={100} disabled={!g.meAdmin && !!g.restrict} aria-label={`Novo nome de ${groupName(g)}`}
                                                onChange={e => setNames(n => ({ ...n, [g.jid]: e.target.value }))} />
                                        </div>
                                    ))}
                                </div>
                            )}
                            {emptyName && <p className="text-xs text-destructive">O nome de um grupo não pode ficar vazio.</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="desc-mode">Descrição</Label>
                            <select id="desc-mode" value={descMode} onChange={e => setDescMode(e.target.value as DescMode)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm">
                                <option value="keep">Não alterar</option><option value="set">Substituir por um novo texto</option><option value="clear">Limpar descrição</option>
                            </select>
                            {descMode === "set" && <Textarea value={descText} maxLength={2048} rows={3} placeholder="Nova descrição (vale para todos os grupos selecionados)" onChange={e => setDescText(e.target.value)} />}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            {triSelect("announce", "Quem pode enviar mensagens", announce, setAnnounce, "Somente admins")}
                            {triSelect("restrict", "Quem pode editar os dados", restrict, setRestrict, "Somente admins")}
                            <div className="space-y-1">
                                <Label htmlFor="ephemeral">Mensagens temporárias <span className="text-xs font-normal text-muted-foreground">(requer admin)</span></Label>
                                <select id="ephemeral" value={ephemeral} onChange={e => setEphemeral(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm">
                                    {EPHEMERAL.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {step === "review" && (
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">Confira antes de aplicar. Isto altera os grupos no WhatsApp para todos os participantes.</p>
                        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                            {plans.map(p => (
                                <li key={p.group.jid} className="space-y-1 px-3 py-2.5 text-sm">
                                    <p className="font-medium" title={groupName(p.group)}>{groupName(p.group)}</p>
                                    {p.changes.map(c => <p key={c} className="flex gap-1.5 text-[13px]"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00bcfe]" />{c}</p>)}
                                    {p.skipped.map(c => <p key={c} className="flex gap-1.5 text-[13px] text-amber-700"><CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" />Não será alterado: {c}</p>)}
                                    {!p.changes.length && !p.skipped.length && <p className="text-[13px] text-muted-foreground">Nada muda neste grupo.</p>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {step === "run" && (
                    <div className="space-y-3">
                        {runner.running ? <ProgressBar done={runner.progress.done} total={runner.progress.total} verb="Processando" /> : <Summary groups={groups} results={runner.results} />}
                        <ResultsList groups={groups} results={runner.results} />
                    </div>
                )}

                <DialogFooter className="gap-2">
                    {step === "edit" && <>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button onClick={() => setStep("review")} disabled={nothing || emptyName} className="bg-[#00bcfe] text-white hover:bg-[#0084cc]">Revisar alterações</Button>
                    </>}
                    {step === "review" && <>
                        <Button variant="outline" onClick={() => setStep("edit")}>Voltar</Button>
                        <Button onClick={() => { setStep("run"); runner.run(groups.map(g => g.jid), worker, 1200); }}
                            disabled={!plans.some(p => p.changes.length)} className="bg-[#00bcfe] text-white hover:bg-[#0084cc]">
                            Aplicar em {plans.filter(p => p.changes.length).length} {plans.filter(p => p.changes.length).length === 1 ? "grupo" : "grupos"}
                        </Button>
                    </>}
                    {step === "run" && <>
                        {finished && failedJids.length > 0 && (
                            <Button variant="outline" onClick={() => runner.run(failedJids, worker, 1200)}><RotateCcw className="h-4 w-4" />Tentar de novo as {failedJids.length} falhas</Button>
                        )}
                        <Button onClick={onClose} disabled={runner.running}>{runner.running ? "Processando…" : "Fechar"}</Button>
                    </>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------- leave / delete

export type RemoveMode = "leave" | "delete";
const MODES: Record<RemoveMode, { title: string; word: string; verb: string; consequences: string[] }> = {
    leave: {
        title: "Sair dos grupos", word: "SAIR", verb: "Saindo de",
        consequences: [
            "Você deixa de participar: não recebe nem envia mais mensagens nesses grupos.",
            "Os outros participantes veem que você saiu. Para voltar, é preciso um novo convite.",
            "A conversa e o histórico continuam no seu WhatsApp, só que somente leitura.",
        ],
    },
    delete: {
        title: "Sair e excluir as conversas", word: "EXCLUIR", verb: "Excluindo",
        consequences: [
            "Primeiro você sai de cada grupo (perde o acesso, como acima).",
            "Depois a conversa e todo o histórico são excluídos da conta conectada: no seu WhatsApp e no MarcFlow. Não dá para desfazer.",
            "Os grupos continuam existindo para os outros participantes: o WhatsApp não permite excluir um grupo para todos.",
        ],
    },
};

export function BatchRemoveDialog({ sessionId, groups, initialMode, onClose, onRemoved }: {
    sessionId: string; groups: GroupRow[]; initialMode: RemoveMode; onClose: () => void; onRemoved: (jid: string) => void;
}) {
    const [mode, setMode] = useState<RemoveMode>(initialMode);
    const [typed, setTyped] = useState("");
    const [started, setStarted] = useState(false);
    const runner = useBatchRunner();
    const m = MODES[mode];
    const confirmed = typed.trim().toUpperCase() === m.word;

    const worker = async (jid: string): Promise<Outcome> => {
        const { ok, json } = await postJson(`/api/groups/${sessionId}/${encodeURIComponent(jid)}/remove`, "POST", { mode });
        if (!ok) return { status: "error", message: json.message || "Falha na operação" };
        onRemoved(jid); // only after WhatsApp confirmed
        return { status: "ok", message: json.message };
    };
    const failedJids = groups.filter(g => runner.results[g.jid]?.status === "error").map(g => g.jid);
    const finished = started && !runner.running && runner.progress.done === runner.progress.total;

    return (
        <Dialog open onOpenChange={o => { if (!o && !runner.running) onClose(); }}>
            <DialogContent className="max-h-[90vh] grid-cols-[minmax(0,1fr)] overflow-y-auto overflow-x-hidden sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{m.title}: {groups.length} {groups.length === 1 ? "grupo" : "grupos"}</DialogTitle>
                    <DialogDescription>Esta ação acontece de verdade no WhatsApp da sessão conectada.</DialogDescription>
                </DialogHeader>

                {!started ? (
                    <div className="space-y-4">
                        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Operação">
                            {(Object.keys(MODES) as RemoveMode[]).map(k => (
                                <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => { setMode(k); setTyped(""); }}
                                    className={cn("rounded-lg border p-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mode === k ? "border-destructive/50 bg-destructive/5" : "border-border hover:bg-muted")}>
                                    <span className="block font-semibold">{MODES[k].title}</span>
                                    <span className="text-xs text-muted-foreground">{k === "leave" ? "Mantém o histórico" : "Apaga o histórico da sua conta"}</span>
                                </button>
                            ))}
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-sm font-medium">Grupos afetados</p>
                            <AffectedList groups={groups} />
                        </div>
                        <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                            <p className="flex items-center gap-1.5 font-semibold text-destructive"><AlertTriangle className="h-4 w-4" />O que vai acontecer</p>
                            <ul className="list-disc space-y-1 pl-5 text-foreground/80">{m.consequences.map(c => <li key={c}>{c}</li>)}</ul>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Não existe “remover só do MarcFlow”: enquanto você participar do grupo, ele volta na próxima sincronização com o WhatsApp.
                        </p>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm-word">Para confirmar, digite <span className="font-mono font-bold">{m.word}</span></Label>
                            <Input id="confirm-word" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {runner.running ? <ProgressBar done={runner.progress.done} total={runner.progress.total} verb={m.verb} /> : <Summary groups={groups} results={runner.results} />}
                        <ResultsList groups={groups} results={runner.results} />
                    </div>
                )}

                <DialogFooter className="gap-2">
                    {!started ? <>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                        <Button disabled={!confirmed} className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={() => { setStarted(true); runner.run(groups.map(g => g.jid), worker, 1500); }}>
                            {m.title}
                        </Button>
                    </> : <>
                        {finished && failedJids.length > 0 && (
                            <Button variant="outline" onClick={() => runner.run(failedJids, worker, 1500)}><RotateCcw className="h-4 w-4" />Tentar de novo as {failedJids.length} falhas</Button>
                        )}
                        <Button onClick={onClose} disabled={runner.running}>{runner.running ? "Processando…" : "Fechar"}</Button>
                    </>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
