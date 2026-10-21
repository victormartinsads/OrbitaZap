"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    RefreshCw,
    Save,
    AlertCircle,
    Settings,
    QrCode,
    Webhook,
    Users,
    Activity,
    DatabaseBackup,
    ImageIcon,
    Bot
} from "lucide-react";
import { toast } from "sonner";

import { SessionManager } from "@/components/dashboard/session-manager";
import ArchivePage from "../archive/page";
import StickerPage from "../sticker/page";
import WebhooksPage from "../webhooks/page";
import UsersPage from "../users/page";
import SystemMonitorPage from "../system-monitor/page";
import BotSettingsPage from "../bot-settings/page";

type TabKey = "general" | "bot" | "sessions" | "webhooks" | "archive" | "stickers" | "users" | "metrics";

function SettingsContent() {
    const { data: authSession } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();
    const isSuperAdmin = (authSession?.user as any)?.role === "SUPERADMIN";

    const currentTab = (searchParams.get("tab") as TabKey) || "general";

    const setTab = (tab: TabKey) => {
        router.push(`/dashboard/settings?tab=${tab}`);
    };

    const [systemConfig, setSystemConfig] = useState({
        appName: "MarcFlow",
        logoUrl: "",
        timezone: "America/Sao_Paulo",
        enableRegistration: true
    });
    const [systemLoading, setSystemLoading] = useState(false);
    const [timezones, setTimezones] = useState<string[]>(["UTC", "America/Sao_Paulo", "Asia/Jakarta"]);

    useEffect(() => {
        try {
            if (typeof Intl !== "undefined" && Intl.supportedValuesOf) {
                const list = Intl.supportedValuesOf("timeZone");
                if (!list.includes("UTC")) list.push("UTC");
                list.sort();
                setTimezones(list);
            }
        } catch (e) {
            console.error("Failed to load timezones", e);
        }
    }, []);

    useEffect(() => {
        fetch('/api/settings/system')
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(responseData => {
                const data = responseData?.data;
                if (data && !responseData.error) {
                    setSystemConfig({
                        appName: data.appName || "MarcFlow",
                        logoUrl: data.logoUrl || "",
                        timezone: data.timezone || "America/Sao_Paulo",
                        enableRegistration: data.enableRegistration !== undefined ? data.enableRegistration : true
                    });
                }
            })
            .catch(() => { });
    }, []);

    const handleSaveSystem = async () => {
        setSystemLoading(true);
        try {
            const res = await fetch('/api/settings/system', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(systemConfig)
            });

            if (res.ok) {
                toast.success("Configurações do sistema atualizadas. Atualize a página para ver as mudanças.");
            } else {
                toast.error("Falha ao atualizar as configurações do sistema");
            }
        } catch (e) {
            toast.error("Erro ao salvar as configurações do sistema");
        } finally {
            setSystemLoading(false);
        }
    };

    const inputClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00bcfe] disabled:cursor-not-allowed disabled:opacity-50";

    const tabs: { key: TabKey; label: string; icon: any; superadminOnly?: boolean }[] = [
        { key: "general", label: "Geral", icon: Settings },
        { key: "bot", label: "Comportamento Bot", icon: Bot },
        { key: "sessions", label: "Conexão WhatsApp", icon: QrCode },
        { key: "webhooks", label: "Webhooks", icon: Webhook },
        { key: "archive", label: "Exportar Histórico", icon: DatabaseBackup },
        { key: "stickers", label: "Figurinhas", icon: ImageIcon },
        { key: "users", label: "Equipe", icon: Users, superadminOnly: true },
        { key: "metrics", label: "Métricas", icon: Activity, superadminOnly: true },
    ];

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Configurações</h1>
                <p className="text-slate-500 text-sm mt-1">
                    Central de configurações de conexões, integrações, equipe, histórico e preferências do sistema.
                </p>
            </div>

            {/* Navigation Tabs Bar */}
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/80">
                {tabs.map((tab) => {
                    if (tab.superadminOnly && !isSuperAdmin) return null;
                    const Icon = tab.icon;
                    const active = currentTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setTab(tab.key)}
                            className={`
                                flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold
                                transition-all duration-150
                                ${active
                                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/70"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                                }
                            `}
                        >
                            <Icon size={15} className={active ? "text-[#00bcfe]" : "text-slate-400"} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Contents */}
            {currentTab === "general" && (
                <div className="space-y-6">
                    {!isSuperAdmin && (
                        <Card className="border-yellow-200 bg-yellow-50">
                            <CardContent className="pt-6">
                                <div className="flex items-start gap-3">
                                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-yellow-900">Modo somente leitura</p>
                                        <p className="text-xs text-yellow-700 mt-1">
                                            Somente Superadmins podem alterar as configurações do sistema. Você pode ver as configurações atuais, mas não pode alterá-las.
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    <Card className="bg-white border-slate-200 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-lg font-bold text-slate-800">Identidade da Ferramenta</CardTitle>
                            <CardDescription className="text-slate-500 text-xs">Nome da plataforma, logo e fuso horário.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid sm:grid-cols-2 gap-4">
                                <div className="grid gap-1.5">
                                    <Label className="text-xs font-semibold text-slate-700">Nome da Plataforma</Label>
                                    <input
                                        className={inputClass}
                                        placeholder="MarcFlow"
                                        value={systemConfig.appName}
                                        onChange={(e) => setSystemConfig(prev => ({ ...prev, appName: e.target.value }))}
                                        disabled={!isSuperAdmin}
                                    />
                                    <p className="text-[11px] text-slate-400">Exibido na barra de navegação e abas.</p>
                                </div>

                                <div className="grid gap-1.5">
                                    <Label className="text-xs font-semibold text-slate-700">Fuso Horário Padrão</Label>
                                    <select
                                        className={inputClass}
                                        value={systemConfig.timezone}
                                        onChange={(e) => setSystemConfig(prev => ({ ...prev, timezone: e.target.value }))}
                                        disabled={!isSuperAdmin}
                                    >
                                        {timezones.map((tz) => (
                                            <option key={tz} value={tz}>
                                                {tz}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-slate-400">Fuso utilizado para envios programados e logs.</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between space-x-2 pt-3 border-t border-slate-100">
                                <Label htmlFor="enable-registration" className="flex flex-col space-y-0.5">
                                    <span className="text-xs font-semibold text-slate-800">Permitir cadastro público de usuários</span>
                                    <span className="font-normal text-[11px] text-slate-400">Deixe desativado para manter a ferramenta privada e restrita a convites.</span>
                                </Label>
                                <Switch
                                    id="enable-registration"
                                    checked={systemConfig.enableRegistration}
                                    onCheckedChange={c => setSystemConfig(prev => ({ ...prev, enableRegistration: c }))}
                                    disabled={!isSuperAdmin}
                                />
                            </div>

                            <div className="pt-2">
                                <Button
                                    onClick={handleSaveSystem}
                                    disabled={systemLoading || !isSuperAdmin}
                                    className="bg-[#00bcfe] hover:bg-[#0084cc] text-white text-xs font-semibold rounded-xl h-9"
                                >
                                    {systemLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                                    Salvar Alterações
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {currentTab === "bot" && <BotSettingsPage />}
            {currentTab === "sessions" && <SessionManager user={authSession?.user} />}
            {currentTab === "webhooks" && <WebhooksPage />}
            {currentTab === "archive" && <ArchivePage />}
            {currentTab === "stickers" && <StickerPage />}
            {currentTab === "users" && isSuperAdmin && <UsersPage />}
            {currentTab === "metrics" && isSuperAdmin && <SystemMonitorPage />}
        </div>
    );
}

export default function SettingsPage() {
    return (
        <Suspense fallback={<div className="p-6 text-sm text-slate-500">Carregando configurações...</div>}>
            <SettingsContent />
        </Suspense>
    );
}
