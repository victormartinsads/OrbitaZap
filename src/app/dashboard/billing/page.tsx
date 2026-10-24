"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, CreditCard, ExternalLink, Loader2, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Cycle = "MONTHLY" | "YEARLY";

interface PlanInfo { id: string; name: string; priceMonthly: number; priceYearly: number; maxSessions: number }
interface PaymentInfo { id: string; value: number; status: string; billingType: string | null; dueDate: string; paidAt: string | null; invoiceUrl: string | null }
interface Pix { qrCodeImage: string; copyPaste: string }
interface BillingData {
    isActive: boolean;
    reason: string;
    deadline: string | null;
    daysLeft: number | null;
    usedSessions: number;
    maxSessions: number | null;
    subscription: null | {
        status: string;
        cycle: Cycle;
        planId: string;
        planName: string;
        pendingPlanId: string | null;
        trialEndsAt: string | null;
        currentPeriodEnd: string | null;
        hasPaidSubscription: boolean;
    };
    openPayment?: { id: string; value: number; dueDate: string; status: string; invoiceUrl: string | null };
    payments: PaymentInfo[];
    plans: PlanInfo[];
    profile: { cpfCnpj: string | null; phone: string | null } | null;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

function maskDocument(value: string) {
    const d = value.replace(/\D/g, "").slice(0, 14);
    if (d.length <= 11) return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    return d.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function maskPhone(value: string) {
    const d = value.replace(/\D/g, "").slice(0, 11);
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4,5})(\d{4})$/, "$1-$2");
}

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
    trial: { text: "Teste grátis", className: "bg-sky-100 text-sky-800 border-sky-200" },
    active: { text: "Ativa", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    grace: { text: "Pagamento em atraso", className: "bg-amber-100 text-amber-800 border-amber-200" },
    canceled: { text: "Cancelada", className: "bg-slate-100 text-slate-700 border-slate-200" },
    superadmin: { text: "Administrador", className: "bg-purple-100 text-purple-800 border-purple-200" },
};
const INACTIVE_LABEL = { text: "Inativa", className: "bg-rose-100 text-rose-800 border-rose-200" };

const PAYMENT_LABEL: Record<string, string> = {
    PENDING: "Aguardando",
    OVERDUE: "Vencida",
    RECEIVED: "Paga",
    CONFIRMED: "Paga",
    RECEIVED_IN_CASH: "Paga",
    REFUNDED: "Estornada",
};

export default function BillingPage() {
    const [data, setData] = useState<BillingData | null>(null);
    const [cycle, setCycle] = useState<Cycle>("MONTHLY");
    const [checkoutPlan, setCheckoutPlan] = useState<PlanInfo | null>(null);
    const [doc, setDoc] = useState("");
    const [phone, setPhone] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [pix, setPix] = useState<Pix | null>(null);
    const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [changing, setChanging] = useState<string | null>(null);

    const load = useCallback(async () => {
        const res = await fetch("/api/billing", { cache: "no-store" });
        if (!res.ok) return null;
        const json: BillingData = await res.json();
        setData(json);
        return json;
    }, []);

    useEffect(() => {
        load().then(json => {
            if (json?.subscription?.cycle) setCycle(json.subscription.cycle);
            if (json?.profile?.cpfCnpj) setDoc(maskDocument(json.profile.cpfCnpj));
            if (json?.profile?.phone) setPhone(maskPhone(json.profile.phone));
        });
    }, [load]);

    // Enquanto a tela de pagamento está aberta, espera o webhook ativar a assinatura.
    useEffect(() => {
        if (!paymentOpen) return;
        const timer = setInterval(async () => {
            const json = await load();
            if (json?.subscription?.status === "ACTIVE" && !json.openPayment) {
                setPaymentOpen(false);
                setPix(null);
                toast.success("Pagamento confirmado! Sua assinatura está ativa.");
            }
        }, 5000);
        return () => clearInterval(timer);
    }, [paymentOpen, load]);

    const startCheckout = async () => {
        if (!checkoutPlan) return;
        setSubmitting(true);
        try {
            const res = await fetch("/api/billing/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId: checkoutPlan.id, cycle, cpfCnpj: doc, phone }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Não foi possível iniciar o pagamento");
            setPix(json.pix);
            setInvoiceUrl(json.invoiceUrl);
            setCheckoutPlan(null);
            setPaymentOpen(true);
            load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro no checkout");
        } finally {
            setSubmitting(false);
        }
    };

    const payOpenInvoice = async () => {
        if (!data?.openPayment) return;
        const res = await fetch(`/api/billing/payments/${data.openPayment.id}/pix`);
        const json = await res.json();
        if (!res.ok) return toast.error(json.error || "Não foi possível carregar a fatura");
        setPix(json.pix);
        setInvoiceUrl(json.invoiceUrl);
        setPaymentOpen(true);
    };

    const changePlan = async (plan: PlanInfo) => {
        setChanging(plan.id);
        try {
            const res = await fetch("/api/billing/change-plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planId: plan.id, cycle }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            toast.success(json.applied === "now"
                ? `Plano ${plan.name} ativado. O novo valor vale a partir da próxima fatura.`
                : `Troca para ${plan.name} agendada para o próximo ciclo.`);
            load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro ao trocar de plano");
        } finally {
            setChanging(null);
        }
    };

    const cancelSubscription = async () => {
        const res = await fetch("/api/billing/cancel", { method: "POST" });
        const json = await res.json();
        if (!res.ok) return toast.error(json.error || "Erro ao cancelar");
        toast.success(json.activeUntil ? `Assinatura cancelada. Você tem acesso até ${date(json.activeUntil)}.` : "Assinatura cancelada.");
        load();
    };

    if (!data) {
        return (
            <div className="flex h-64 items-center justify-center text-slate-400">
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    const sub = data.subscription;
    const status = data.isActive ? STATUS_LABEL[data.reason] ?? STATUS_LABEL.active : INACTIVE_LABEL;
    const hasPaid = !!sub?.hasPaidSubscription;
    const yearlySavings = (p: PlanInfo) => Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100);

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <div>
                <h1 className="text-xl font-bold text-slate-900">Assinatura</h1>
                <p className="text-sm text-slate-500">Escolha seu plano e acompanhe suas faturas.</p>
            </div>

            {/* Situação atual */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <span className="text-base font-semibold text-slate-900">
                                {data.reason === "superadmin" ? "Acesso total" : `Plano ${sub?.planName ?? "—"}`}
                            </span>
                            <Badge variant="outline" className={status.className}>{status.text}</Badge>
                        </div>
                        <p className="text-sm text-slate-500">
                            {data.reason === "trial" && `Seu teste grátis vai até ${date(data.deadline)} (${data.daysLeft} dia${data.daysLeft === 1 ? "" : "s"}).`}
                            {data.reason === "active" && `Próxima renovação em ${date(sub?.currentPeriodEnd ?? null)} · ${sub?.cycle === "YEARLY" ? "anual" : "mensal"}.`}
                            {data.reason === "grace" && `Pague até ${date(data.deadline)} para não perder o acesso.`}
                            {data.reason === "canceled" && `Acesso até ${date(data.deadline)}.`}
                            {!data.isActive && "Seus WhatsApps estão pausados. Assine um plano para reativá-los — nada foi apagado."}
                        </p>
                        {sub?.pendingPlanId && hasPaid && (
                            <p className="text-xs text-amber-700">
                                Troca para {data.plans.find(p => p.id === sub.pendingPlanId)?.name} agendada para a próxima renovação.
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
                        <Smartphone size={16} className="text-[#00bcfe]" />
                        <span className="font-semibold text-slate-900">{data.usedSessions}</span>
                        <span className="text-slate-500">de {data.maxSessions ?? "∞"} WhatsApps</span>
                    </div>
                </div>

                {data.openPayment && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                        <span className="text-amber-900">
                            Fatura de <strong>{brl(data.openPayment.value)}</strong>{" "}
                            {data.openPayment.status === "OVERDUE" ? "vencida em" : "vence em"} {date(data.openPayment.dueDate)}
                        </span>
                        <Button size="sm" onClick={payOpenInvoice} className="gap-1.5">
                            <QrCode size={14} /> Pagar agora
                        </Button>
                    </div>
                )}
            </div>

            {/* Planos */}
            <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-slate-900">Planos</h2>
                    <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold">
                        {(["MONTHLY", "YEARLY"] as Cycle[]).map(c => (
                            <button
                                key={c}
                                onClick={() => setCycle(c)}
                                className={`rounded-full px-4 py-1.5 transition-colors ${cycle === c ? "bg-[#00bcfe] text-white" : "text-slate-600 hover:text-slate-900"}`}
                            >
                                {c === "MONTHLY" ? "Mensal" : "Anual · 2 meses grátis"}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    {data.plans.map(plan => {
                        const isCurrent = hasPaid && sub?.planId === plan.id && sub?.cycle === cycle;
                        const price = cycle === "YEARLY" ? plan.priceYearly : plan.priceMonthly;
                        const highlighted = plan.id === "pro";
                        return (
                            <div
                                key={plan.id}
                                className={`relative flex flex-col rounded-2xl border bg-white p-5 shadow-2xs ${highlighted ? "border-[#00bcfe] ring-1 ring-[#00bcfe]/30" : "border-slate-200"}`}
                            >
                                {highlighted && (
                                    <span className="absolute -top-2.5 left-5 rounded-full bg-[#00bcfe] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                        Mais escolhido
                                    </span>
                                )}
                                <h3 className="text-sm font-semibold text-slate-900">{plan.name}</h3>
                                <div className="mt-2 flex items-baseline gap-1">
                                    <span className="text-2xl font-bold text-slate-900">{brl(price)}</span>
                                    <span className="text-xs text-slate-500">/{cycle === "YEARLY" ? "ano" : "mês"}</span>
                                </div>
                                {cycle === "YEARLY" && (
                                    <p className="text-xs font-medium text-emerald-700">
                                        Equivale a {brl(plan.priceYearly / 12)}/mês · economia de {yearlySavings(plan)}%
                                    </p>
                                )}
                                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                                    <li className="flex items-center gap-2">
                                        <Check size={14} className="text-emerald-600" />
                                        {plan.maxSessions} WhatsApp{plan.maxSessions > 1 ? "s" : ""} conectado{plan.maxSessions > 1 ? "s" : ""}
                                    </li>
                                    <li className="flex items-center gap-2"><Check size={14} className="text-emerald-600" />CRM, fluxos e disparos</li>
                                    <li className="flex items-center gap-2"><Check size={14} className="text-emerald-600" />Prospecção com IA</li>
                                    <li className="flex items-center gap-2"><Check size={14} className="text-emerald-600" />API e webhooks</li>
                                </ul>
                                <Button
                                    className="mt-5 w-full"
                                    variant={highlighted ? "default" : "outline"}
                                    disabled={isCurrent || changing === plan.id || data.reason === "superadmin"}
                                    onClick={() => (hasPaid ? changePlan(plan) : setCheckoutPlan(plan))}
                                >
                                    {changing === plan.id && <Loader2 size={14} className="animate-spin" />}
                                    {isCurrent ? "Plano atual" : hasPaid ? "Trocar para este" : "Assinar"}
                                </Button>
                            </div>
                        );
                    })}
                </div>
                <p className="text-xs text-slate-500">Pague com Pix, boleto ou cartão. Cancele quando quiser.</p>
            </div>

            {/* Faturas */}
            {data.payments.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-2xs">
                    <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">Faturas</h2>
                    <div className="divide-y divide-slate-100">
                        {data.payments.map(p => (
                            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                                <span className="text-slate-600">{date(p.dueDate)}</span>
                                <span className="font-medium text-slate-900">{brl(p.value)}</span>
                                <span className="text-slate-500">{PAYMENT_LABEL[p.status] ?? p.status}</span>
                                {p.invoiceUrl ? (
                                    <a href={p.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0084cc] hover:underline">
                                        Ver fatura <ExternalLink size={12} />
                                    </a>
                                ) : <span />}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {(hasPaid || sub?.status === "TRIALING" && data.openPayment) && (
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <button className="text-xs text-slate-500 underline underline-offset-2 hover:text-rose-600">Cancelar assinatura</button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Cancelar assinatura?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Você continua com acesso até o fim do período já pago. Depois disso, seus WhatsApps são pausados, mas nada é apagado.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Manter assinatura</AlertDialogCancel>
                            <AlertDialogAction onClick={cancelSubscription} className="bg-rose-600 hover:bg-rose-700">Cancelar</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}

            {/* Dados para cobrança */}
            <Dialog open={!!checkoutPlan} onOpenChange={open => !open && setCheckoutPlan(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Assinar plano {checkoutPlan?.name}</DialogTitle>
                        <DialogDescription>
                            {checkoutPlan && `${brl(cycle === "YEARLY" ? checkoutPlan.priceYearly : checkoutPlan.priceMonthly)} por ${cycle === "YEARLY" ? "ano" : "mês"}. `}
                            Precisamos do CPF ou CNPJ para emitir a cobrança.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="doc">CPF ou CNPJ</Label>
                            <Input id="doc" inputMode="numeric" value={doc} onChange={e => setDoc(maskDocument(e.target.value))} placeholder="000.000.000-00" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="phone">Celular (opcional)</Label>
                            <Input id="phone" inputMode="tel" value={phone} onChange={e => setPhone(maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
                        </div>
                        <Button className="w-full gap-1.5" disabled={submitting || doc.replace(/\D/g, "").length < 11} onClick={startCheckout}>
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                            Continuar para o pagamento
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Pagamento */}
            <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Pague com Pix</DialogTitle>
                        <DialogDescription>A assinatura é ativada sozinha assim que o pagamento for confirmado.</DialogDescription>
                    </DialogHeader>
                    {pix ? (
                        <div className="space-y-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={pix.qrCodeImage} alt="QR Code Pix" className="mx-auto h-56 w-56 rounded-lg border border-slate-200" />
                            <div className="flex gap-2">
                                <Input readOnly value={pix.copyPaste} className="font-mono text-xs" />
                                <Button
                                    variant="outline"
                                    className="gap-1.5"
                                    onClick={() => navigator.clipboard.writeText(pix.copyPaste).then(() => toast.success("Código Pix copiado"))}
                                >
                                    <Copy size={14} /> Copiar
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500">O QR Code Pix não está disponível agora. Use o link abaixo para pagar.</p>
                    )}
                    {invoiceUrl && (
                        <a href={invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-[#0084cc] hover:underline">
                            Pagar com boleto ou cartão <ExternalLink size={13} />
                        </a>
                    )}
                    <p className="flex items-center justify-center gap-2 text-xs text-slate-400">
                        <Loader2 size={12} className="animate-spin" /> Aguardando confirmação do pagamento…
                    </p>
                </DialogContent>
            </Dialog>
        </div>
    );
}
