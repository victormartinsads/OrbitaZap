"use client";

import { useState } from "react";
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
import { Copy, Check, ExternalLink, ShieldAlert, Sparkles, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

interface IntegrationsModalProps {
    isOpen: boolean;
    onClose: () => void;
    configs: any[];
    onRefresh: () => void;
}

export function IntegrationsModal({ isOpen, onClose, configs }: IntegrationsModalProps) {
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedToken(id);
        toast.success("Copiado para a área de transferência!");
        setTimeout(() => setCopiedToken(null), 2000);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl bg-white rounded-2xl border-slate-200 max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-slate-900">
                        Integrações Nativas de Entrada
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Conecte Meta Leads (Facebook/Instagram), Google Sheets ou Webhooks universais para alimentar automaticamente seu Kanban.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Meta Ads Native Form */}
                    <Card className="border-slate-200 shadow-2xs rounded-2xl bg-slate-50/50">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold text-xs">
                                        Meta
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900">Formulários Nativos do Meta Ads (Lead Ads)</h4>
                                        <p className="text-[11px] text-slate-500">Facebook e Instagram Leads via Webhook direto.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold text-slate-600">URL do Webhook (Cole no Meta Developers):</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={`${baseUrl}/api/crm/integrations/meta`}
                                        className="h-8 text-xs bg-white border-slate-200 font-mono"
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => copyToClipboard(`${baseUrl}/api/crm/integrations/meta`, "meta-url")}
                                        className="h-8 px-2.5 rounded-xl border-slate-200 shrink-0"
                                    >
                                        {copiedToken === "meta-url" ? <Check size={14} className="text-[#00bcfe]" /> : <Copy size={14} />}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Google Sheets Integration */}
                    <Card className="border-slate-200 shadow-2xs rounded-2xl bg-slate-50/50">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                                        <FileSpreadsheet size={16} />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900">Google Sheets (Planilhas Google)</h4>
                                        <p className="text-[11px] text-slate-500">Envie dados de novas linhas de planilhas para o CRM.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold text-slate-600">Webhook de Entrada (Google Apps Script):</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={`${baseUrl}/api/crm/integrations/sheets?token=sheets_sync_token`}
                                        className="h-8 text-xs bg-white border-slate-200 font-mono"
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => copyToClipboard(`${baseUrl}/api/crm/integrations/sheets?token=sheets_sync_token`, "sheets-url")}
                                        className="h-8 px-2.5 rounded-xl border-slate-200 shrink-0"
                                    >
                                        {copiedToken === "sheets-url" ? <Check size={14} className="text-[#00bcfe]" /> : <Copy size={14} />}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Universal Webhook (Kiwify, Hotmart, WordPress, Typeform) */}
                    <Card className="border-slate-200 shadow-2xs rounded-2xl bg-slate-50/50">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center">
                                        <Sparkles size={16} />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-900">Webhook Universal de Leads & Vendas</h4>
                                        <p className="text-[11px] text-slate-500">Para Kiwify, Hotmart, Mercado Pago, Elementor ou sites próprios.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[11px] font-semibold text-slate-600">Endpoint Universal POST:</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        readOnly
                                        value={`${baseUrl}/api/crm/integrations/webhook?token=universal_crm_token`}
                                        className="h-8 text-xs bg-white border-slate-200 font-mono"
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => copyToClipboard(`${baseUrl}/api/crm/integrations/webhook?token=universal_crm_token`, "webhook-url")}
                                        className="h-8 px-2.5 rounded-xl border-slate-200 shrink-0"
                                    >
                                        {copiedToken === "webhook-url" ? <Check size={14} className="text-[#00bcfe]" /> : <Copy size={14} />}
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </DialogContent>
        </Dialog>
    );
}
