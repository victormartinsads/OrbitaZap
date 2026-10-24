"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check, Sparkles, FileSpreadsheet, Loader2, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";

type Provider = "META_ADS" | "GOOGLE_SHEETS" | "WEBHOOK";

interface IntegrationConfig {
    id: string;
    provider: Provider;
    name: string;
    webhookToken: string;
    verifyToken: string | null;
    hasAccessToken: boolean;
    hasAppSecret: boolean;
}

interface IntegrationsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ENDPOINT: Record<Provider, string> = {
    META_ADS: "/api/crm/integrations/meta",
    GOOGLE_SHEETS: "/api/crm/integrations/sheets",
    WEBHOOK: "/api/crm/integrations/webhook",
};

const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");

export function IntegrationsModal({ isOpen, onClose }: IntegrationsModalProps) {
    const [configs, setConfigs] = useState<IntegrationConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [copied, setCopied] = useState<string | null>(null);
    const [meta, setMeta] = useState({ verifyToken: "", accessToken: "", appSecret: "" });

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/crm/integrations");
            const data = await res.json();
            if (res.ok) setConfigs(data.configs ?? []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        load();
        setMeta({ verifyToken: randomToken(), accessToken: "", appSecret: "" });
    }, [isOpen, load]);

    const urlFor = (c: IntegrationConfig) => `${baseUrl}${ENDPOINT[c.provider]}?token=${c.webhookToken}`;

    const copy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopied(id);
        toast.success("Copiado para a área de transferência!");
        setTimeout(() => setCopied(null), 2000);
    };

    const create = async (provider: Provider, name: string, extra: Record<string, string> = {}) => {
        setBusy(provider);
        try {
            const res = await fetch("/api/crm/integrations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, name, ...extra }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Não foi possível criar a integração");
            toast.success("Integração criada!");
            await load();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro ao criar integração");
        } finally {
            setBusy(null);
        }
    };

    const remove = async (c: IntegrationConfig) => {
        if (!confirm(`Remover a integração "${c.name}"? A URL atual deixa de funcionar.`)) return;
        setBusy(c.id);
        try {
            const res = await fetch(`/api/crm/integrations?id=${c.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error();
            toast.success("Integração removida");
            await load();
        } catch {
            toast.error("Erro ao remover integração");
        } finally {
            setBusy(null);
        }
    };

    const UrlRow = ({ config, label }: { config: IntegrationConfig; label: string }) => (
        <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-slate-600">{label}</Label>
            <div className="flex items-center gap-2">
                <Input readOnly value={urlFor(config)} className="h-8 text-xs bg-white border-slate-200 font-mono" />
                <Button size="sm" variant="outline" onClick={() => copy(urlFor(config), config.id)} className="h-8 px-2.5 rounded-xl border-slate-200 shrink-0">
                    {copied === config.id ? <Check size={14} className="text-[#00bcfe]" /> : <Copy size={14} />}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === config.id} onClick={() => remove(config)} className="h-8 px-2.5 rounded-xl shrink-0 text-slate-400 hover:text-rose-600" title="Remover integração">
                    <Trash2 size={14} />
                </Button>
            </div>
        </div>
    );

    const section = (provider: Provider) => configs.filter(c => c.provider === provider);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl bg-white rounded-2xl border-slate-200 max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-slate-900">
                        Integrações de Entrada
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Conecte Meta Lead Ads, Google Sheets ou qualquer sistema via webhook. Os leads entram na primeira etapa do seu funil.
                    </DialogDescription>
                </DialogHeader>

                {loading && configs.length === 0 ? (
                    <div className="flex justify-center py-10 text-slate-400"><Loader2 className="animate-spin" /></div>
                ) : (
                    <div className="space-y-4 py-2">
                        {/* Meta Lead Ads */}
                        <Card className="border-slate-200 shadow-2xs rounded-2xl bg-slate-50/50">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xs">Meta</div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900">Formulários Nativos do Meta Ads (Lead Ads)</h4>
                                        <p className="text-[11px] text-slate-500">Facebook e Instagram Leads via webhook do Meta Developers.</p>
                                    </div>
                                </div>

                                {section("META_ADS").map(c => (
                                    <div key={c.id} className="space-y-2">
                                        <UrlRow config={c} label="URL de callback (cole no Meta Developers):" />
                                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                            <span>Verify Token:</span>
                                            <code className="rounded bg-white px-1.5 py-0.5 border border-slate-200">{c.verifyToken}</code>
                                            <button onClick={() => copy(c.verifyToken ?? "", `${c.id}-verify`)} className="text-[#0084cc] hover:underline">
                                                {copied === `${c.id}-verify` ? "copiado" : "copiar"}
                                            </button>
                                            <span>· Access Token {c.hasAccessToken ? "✓" : "não informado"}</span>
                                            <span>· App Secret {c.hasAppSecret ? "✓ (assinatura verificada)" : "não informado"}</span>
                                        </div>
                                    </div>
                                ))}

                                {section("META_ADS").length === 0 && (
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        <div className="space-y-1">
                                            <Label className="text-[11px] font-semibold text-slate-600">Verify Token</Label>
                                            <Input value={meta.verifyToken} onChange={e => setMeta(m => ({ ...m, verifyToken: e.target.value }))} className="h-8 text-xs bg-white font-mono" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px] font-semibold text-slate-600">Access Token da página</Label>
                                            <Input type="password" value={meta.accessToken} onChange={e => setMeta(m => ({ ...m, accessToken: e.target.value }))} className="h-8 text-xs bg-white" placeholder="EAAG…" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px] font-semibold text-slate-600">App Secret (recomendado)</Label>
                                            <Input type="password" value={meta.appSecret} onChange={e => setMeta(m => ({ ...m, appSecret: e.target.value }))} className="h-8 text-xs bg-white" />
                                        </div>
                                        <Button
                                            size="sm"
                                            className="sm:col-span-3 gap-1.5"
                                            disabled={busy === "META_ADS" || !meta.verifyToken}
                                            onClick={() => create("META_ADS", "Meta Lead Ads", meta)}
                                        >
                                            {busy === "META_ADS" ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                                            Conectar Meta Lead Ads
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Google Sheets */}
                        <Card className="border-slate-200 shadow-2xs rounded-2xl bg-slate-50/50">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                        <FileSpreadsheet size={16} />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900">Google Sheets (Planilhas Google)</h4>
                                        <p className="text-[11px] text-slate-500">Envie novas linhas da planilha para o CRM via Google Apps Script.</p>
                                    </div>
                                </div>
                                {section("GOOGLE_SHEETS").map(c => <UrlRow key={c.id} config={c} label="Webhook de entrada (Google Apps Script):" />)}
                                {section("GOOGLE_SHEETS").length === 0 && (
                                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy === "GOOGLE_SHEETS"} onClick={() => create("GOOGLE_SHEETS", "Google Sheets")}>
                                        {busy === "GOOGLE_SHEETS" ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                                        Gerar URL
                                    </Button>
                                )}
                            </CardContent>
                        </Card>

                        {/* Webhook universal */}
                        <Card className="border-slate-200 shadow-2xs rounded-2xl bg-slate-50/50">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
                                        <Sparkles size={16} />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900">Webhook Universal de Leads & Vendas</h4>
                                        <p className="text-[11px] text-slate-500">Para Kiwify, Hotmart, Elementor, Typeform ou sites próprios. Envie JSON com name, phone e email.</p>
                                    </div>
                                </div>
                                {section("WEBHOOK").map(c => <UrlRow key={c.id} config={c} label="Endpoint POST:" />)}
                                {section("WEBHOOK").length === 0 && (
                                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy === "WEBHOOK"} onClick={() => create("WEBHOOK", "Webhook Universal")}>
                                        {busy === "WEBHOOK" ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                                        Gerar URL
                                    </Button>
                                )}
                            </CardContent>
                        </Card>

                        <p className="text-[11px] text-slate-400">
                            Mantenha essas URLs em segredo: o token nelas é o que autoriza a entrada de leads. Se vazar, remova a integração e gere outra.
                        </p>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
