"use client";

import { useState, useEffect } from "react";
import {
    Sparkles,
    Search,
    Send,
    MessageSquare,
    Settings,
    QrCode,
    Play,
    Pause,
    RotateCcw,
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    User,
    Building2,
    MapPin,
    Globe,
    Phone,
    ShieldAlert,
    RefreshCw,
    Bot,
    Plus,
    Trash2,
    Flame,
    ArrowUpRight,
    HelpCircle,
    Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { SessionSelector } from "@/components/dashboard/session-selector";
import { useSession as useWaSession } from "@/components/dashboard/session-provider";

export default function ProspectPage() {
    const { sessions, sessionId: activeSessionId, setSessionId } = useWaSession();

    // Tab ativa
    const [tab, setTab] = useState("leads");

    // Configurações
    const [config, setConfig] = useState<any>(null);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [savingConfig, setSavingConfig] = useState(false);

    // Busca Google Maps
    const [searchNiche, setSearchNiche] = useState("barbearia");
    const [searchCity, setSearchCity] = useState("São Paulo");
    const [onlyWithoutSite, setOnlyWithoutSite] = useState(false);
    const [useDeepScraper, setUseDeepScraper] = useState(true);
    const [searching, setSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [selectedPlaces, setSelectedPlaces] = useState<Set<string>>(new Set());
    const [importingPlaces, setImportingPlaces] = useState(false);
    const [viewingPlace, setViewingPlace] = useState<any>(null);

    // Campanhas
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
    const [newCampaignName, setNewCampaignName] = useState("");
    const [openingTemplate, setOpeningTemplate] = useState(
        `{Oi|Olá}, {primeiro_nome}! Tudo bem?\nVi a {nome} no Google e gostei muito do trabalho de vocês em {cidade}.\n\nNotei que vocês ainda não possuem um site próprio. Já pensaram em criar um para passar mais credibilidade e atrair novos clientes direto no WhatsApp?`
    );
    const [creatingCampaign, setCreatingCampaign] = useState(false);

    // Leads & Conversas
    const [leads, setLeads] = useState<any[]>([]);
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [leadMessages, setLeadMessages] = useState<any[]>([]);
    const [manualReply, setManualReply] = useState("");
    const [sendingManual, setSendingManual] = useState(false);
    const [loadingLeads, setLoadingLeads] = useState(false);

    // Carregar configurações
    const loadConfig = async () => {
        try {
            setLoadingConfig(true);
            const res = await fetch("/api/prospect/config");
            const data = await res.json();
            if (data.config) {
                setConfig(data.config);
                if (data.config.sessionId && !activeSessionId) {
                    setSessionId(data.config.sessionId);
                }
            }
        } catch {
            toast.error("Falha ao carregar configurações de prospecção");
        } finally {
            setLoadingConfig(false);
        }
    };

    // Salvar configurações
    const saveConfig = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        try {
            setSavingConfig(true);
            const res = await fetch("/api/prospect/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...config,
                    sessionId: activeSessionId || config?.sessionId,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setConfig(data.config);
                toast.success("Configurações salvas com sucesso!");
            } else {
                toast.error(data.error || "Erro ao salvar");
            }
        } catch {
            toast.error("Erro ao salvar configurações");
        } finally {
            setSavingConfig(false);
        }
    };

    // Carregar campanhas
    const loadCampaigns = async () => {
        try {
            const res = await fetch("/api/prospect/campaigns");
            const data = await res.json();
            if (data.campaigns) {
                setCampaigns(data.campaigns);
                if (!selectedCampaign && data.campaigns.length > 0) {
                    setSelectedCampaign(data.campaigns[0]);
                }
            }
        } catch {
            toast.error("Erro ao carregar campanhas");
        }
    };

    // Criar campanha
    const handleCreateCampaign = async () => {
        if (!newCampaignName.trim()) {
            return toast.error("Digite um nome para a campanha");
        }
        try {
            setCreatingCampaign(true);
            const res = await fetch("/api/prospect/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newCampaignName,
                    openingMessage: openingTemplate,
                }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Campanha criada!");
                setNewCampaignName("");
                await loadCampaigns();
                setSelectedCampaign(data.campaign);
            } else {
                toast.error(data.error || "Erro ao criar campanha");
            }
        } catch {
            toast.error("Falha ao criar campanha");
        } finally {
            setCreatingCampaign(false);
        }
    };

    // Ações na campanha (start, pause, reset)
    const handleCampaignAction = async (campaignId: string, action: "start" | "pause" | "reset") => {
        try {
            const res = await fetch(`/api/prospect/campaigns/${campaignId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Campanha ${action === "start" ? "iniciada" : action === "pause" ? "pausada" : "reiniciada"}!`);
                await loadCampaigns();
                if (selectedCampaign?.id === campaignId) {
                    setSelectedCampaign((prev: any) => ({ ...prev, status: data.status }));
                }
            } else {
                toast.error(data.error || "Erro ao executar ação");
            }
        } catch {
            toast.error("Falha na ação da campanha");
        }
    };

    // Carregar leads
    const loadLeads = async () => {
        try {
            setLoadingLeads(true);
            const query = statusFilter !== "ALL" ? `?status=${statusFilter}` : "";
            const res = await fetch(`/api/prospect/leads${query}`);
            const data = await res.json();
            if (data.leads) {
                setLeads(data.leads);
                setStatusCounts(data.statusCounts || {});
            }
        } catch {
            toast.error("Erro ao carregar leads");
        } finally {
            setLoadingLeads(false);
        }
    };

    // Abrir detalhes e conversa do lead
    const openLeadChat = async (lead: any) => {
        setSelectedLead(lead);
        try {
            const res = await fetch(`/api/prospect/leads/${lead.id}`);
            const data = await res.json();
            if (data.lead) {
                setLeadMessages(data.lead.messages || []);
                // Atualiza contadores locais
                setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, unread: 0 } : l)));
            }
        } catch {
            toast.error("Erro ao carregar conversa do lead");
        }
    };

    // Alternar pausa da IA no lead
    const toggleLeadAi = async (leadId: string, currentPaused: boolean) => {
        try {
            const res = await fetch(`/api/prospect/leads/${leadId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ aiPaused: !currentPaused }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(!currentPaused ? "IA pausada (você assume)" : "IA reativada");
                setSelectedLead((prev: any) => (prev ? { ...prev, aiPaused: !currentPaused } : prev));
                setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, aiPaused: !currentPaused } : l)));
            }
        } catch {
            toast.error("Erro ao alterar estado da IA");
        }
    };

    // Enviar mensagem manual para o lead
    const handleSendManual = async () => {
        if (!selectedLead || !manualReply.trim()) return;
        try {
            setSendingManual(true);
            const res = await fetch(`/api/prospect/leads/${selectedLead.id}/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: manualReply }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Mensagem enviada!");
                setLeadMessages((prev) => [...prev, data.message]);
                setManualReply("");
                setSelectedLead((prev: any) => ({ ...prev, aiPaused: true }));
            } else {
                toast.error(data.error || "Erro ao enviar");
            }
        } catch {
            toast.error("Falha ao enviar mensagem");
        } finally {
            setSendingManual(false);
        }
    };

    // Buscar no Google Maps
    const handleSearchMaps = async () => {
        if (!searchNiche || !searchCity) {
            return toast.error("Informe nicho e cidade");
        }
        // Permite buscar diretamente mesmo sem chave cadastrada (usa Open Web search como fallback)

        try {
            setSearching(true);
            setSearchResults([]);
            setSelectedPlaces(new Set());
            const res = await fetch("/api/prospect/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    niche: searchNiche,
                    city: searchCity,
                    onlyWithoutWebsite: onlyWithoutSite,
                    useDeepScraper,
                    maxResults: 60,
                }),
            });
            const data = await res.json();
            if (data.results) {
                setSearchResults(data.results);
                // Pré-seleciona todos que têm celular e ainda não foram salvos
                const preSelect = new Set<string>();
                data.results.forEach((r: any) => {
                    if (r.phone && !r.alreadySaved) preSelect.add(r.placeId);
                });
                setSelectedPlaces(preSelect);
                toast.success(`Encontradas ${data.results.length} empresas!`);
            } else {
                toast.error(data.error || "Erro na busca");
            }
        } catch {
            toast.error("Falha ao buscar no Google Maps");
        } finally {
            setSearching(false);
        }
    };

    // Importar selecionados do Maps para a campanha
    const handleImportSelected = async () => {
        const toImport = searchResults.filter((r) => selectedPlaces.has(r.placeId) && r.phone);
        if (toImport.length === 0) {
            return toast.error("Nenhuma empresa com telefone selecionada");
        }

        try {
            setImportingPlaces(true);
            const res = await fetch("/api/prospect/leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    campaignId: selectedCampaign?.id || null,
                    defaultCity: searchCity,
                    defaultCategory: searchNiche,
                    leads: toImport.map((r) => ({
                        name: r.name,
                        phone: r.phone,
                        city: searchCity,
                        category: r.category || searchNiche,
                        address: r.address,
                        website: r.website,
                        rating: r.rating,
                        reviews: r.reviews,
                        mapsUrl: r.mapsUrl,
                        email: r.email,
                        instagram: r.instagram,
                        facebook: r.facebook,
                        placeId: r.placeId,
                        source: "MAPS",
                    })),
                }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`${data.savedCount} leads adicionados à lista!`);
                await loadLeads();
                await loadCampaigns();
                setTab("campaign");
            } else {
                toast.error(data.error || "Erro ao salvar leads");
            }
        } catch {
            toast.error("Falha ao salvar leads");
        } finally {
            setImportingPlaces(false);
        }
    };

    useEffect(() => {
        loadConfig();
        loadCampaigns();
        loadLeads();
    }, []);

    useEffect(() => {
        loadLeads();
    }, [statusFilter]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Cabeçalho */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 rounded-2xl text-white shadow-lg">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="p-2 bg-white/20 backdrop-blur-md rounded-lg">
                            <Sparkles className="w-5 h-5 text-yellow-300" />
                        </span>
                        <h1 className="text-2xl font-bold tracking-tight">Prospecção com IA</h1>
                        <Badge variant="secondary" className="bg-white/20 text-white border-0 text-xs">
                            Beta
                        </Badge>
                    </div>
                    <p className="text-white/80 text-sm max-w-xl">
                        Busque empresas no Google Maps, faça disparos humanizados e deixe o Gemini qualificar e vender seus sites.
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-2 rounded-xl border border-white/20">
                    <Bot className="w-4 h-4 text-emerald-300" />
                    <span className="text-xs font-medium">WhatsApp Conectado:</span>
                    <SessionSelector />
                </div>
            </div>

            {/* Abas Principais */}
            <Tabs value={tab} onValueChange={setTab} className="space-y-4">
                <TabsList className="bg-slate-100 p-1 rounded-xl grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto">
                    <TabsTrigger value="leads" className="rounded-lg gap-2 text-xs sm:text-sm">
                        <Search className="w-4 h-4" />
                        1. Buscar no Maps
                    </TabsTrigger>
                    <TabsTrigger value="campaign" className="rounded-lg gap-2 text-xs sm:text-sm">
                        <Send className="w-4 h-4" />
                        2. Campanha & Disparo
                    </TabsTrigger>
                    <TabsTrigger value="conversations" className="rounded-lg gap-2 text-xs sm:text-sm relative">
                        <MessageSquare className="w-4 h-4" />
                        3. Conversas IA
                        {statusCounts["INTERESTED"] ? (
                            <span className="ml-1 px-1.5 py-0.2 bg-emerald-500 text-white text-[10px] rounded-full font-bold animate-pulse">
                                {statusCounts["INTERESTED"]}
                            </span>
                        ) : null}
                    </TabsTrigger>
                    <TabsTrigger value="settings" className="rounded-lg gap-2 text-xs sm:text-sm">
                        <Settings className="w-4 h-4" />
                        Configurações & Oferta
                    </TabsTrigger>
                </TabsList>

                {/* ────────────────── ABA 1: BUSCAR NO MAPS ────────────────── */}
                <TabsContent value="leads" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Search className="w-5 h-5 text-blue-600" />
                                Prospectar Empresas Locais
                            </CardTitle>
                            <CardDescription>
                                Encontre negócios da sua região diretamente pelo Google Places. Por padrão filtramos apenas empresas <strong>sem site</strong>, que têm a maior taxa de conversão.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Nicho / Segmento</label>
                                    <Input
                                        placeholder="Ex: barbearia, dentista, contabilidade..."
                                        value={searchNiche}
                                        onChange={(e) => setSearchNiche(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Cidade ou Bairro</label>
                                    <Input
                                        placeholder="Ex: Campinas SP, Moema São Paulo..."
                                        value={searchCity}
                                        onChange={(e) => setSearchCity(e.target.value)}
                                    />
                                </div>
                                <div className="flex flex-col justify-end">
                                    <Button
                                        onClick={handleSearchMaps}
                                        disabled={searching}
                                        className="bg-blue-600 hover:bg-blue-700 text-white gap-2 h-10"
                                    >
                                        {searching ? (
                                            <>
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                                Buscando no Maps...
                                            </>
                                        ) : (
                                            <>
                                                <Search className="w-4 h-4" />
                                                Buscar Empresas
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t text-sm">
                                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={onlyWithoutSite}
                                        onChange={(e) => setOnlyWithoutSite(e.target.checked)}
                                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>Mostrar apenas empresas <strong>sem site cadastrado</strong></span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-700 bg-purple-50 border border-purple-200 px-3 py-1 rounded-xl">
                                    <input
                                        type="checkbox"
                                        checked={useDeepScraper}
                                        onChange={(e) => setUseDeepScraper(e.target.checked)}
                                        className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                                    />
                                    <span className="text-xs">
                                        ⚡ <strong>Deep Scraper Local (Sem API):</strong> extrair também E-mail, Instagram e Facebook via Edge
                                    </span>
                                </label>

                                {searchResults.length > 0 && (
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500">
                                            {selectedPlaces.size} selecionados de {searchResults.length}
                                        </span>
                                        <Button
                                            size="sm"
                                            onClick={handleImportSelected}
                                            disabled={importingPlaces || selectedPlaces.size === 0}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Adicionar à Lista ({selectedPlaces.size})
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Resultados do Maps */}
                    {searchResults.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {searchResults.map((place) => {
                                const isSelected = selectedPlaces.has(place.placeId);
                                return (
                                    <Card
                                        key={place.placeId}
                                        className={`transition-all border-2 cursor-pointer hover:shadow-md ${
                                            isSelected ? "border-blue-500 bg-blue-50/30" : "border-slate-200 hover:border-blue-200"
                                        } ${place.alreadySaved ? "opacity-60" : ""}`}
                                        onClick={() => setViewingPlace(place)}
                                    >
                                        <CardContent className="p-4 space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <h3 className="font-semibold text-sm line-clamp-1 text-slate-800 hover:text-blue-600 transition-colors">
                                                    {place.name}
                                                </h3>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={() => {
                                                        const next = new Set(selectedPlaces);
                                                        if (next.has(place.placeId)) next.delete(place.placeId);
                                                        else next.add(place.placeId);
                                                        setSelectedPlaces(next);
                                                    }}
                                                    className="w-4 h-4 rounded text-blue-600 mt-1 cursor-pointer shrink-0"
                                                />
                                            </div>

                                            <div className="space-y-1 text-xs text-slate-600">
                                                <div className="flex items-center gap-1 text-slate-500 line-clamp-1">
                                                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                                                    <span>{place.address || "Sem endereço"}</span>
                                                </div>

                                                <div className="flex items-center justify-between pt-1">
                                                    <span className="flex items-center gap-1 font-mono font-medium text-slate-800">
                                                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                                                        {place.rawPhone || "Sem telefone"}
                                                    </span>
                                                    {place.isMobile && (
                                                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
                                                            Celular BR
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between pt-1 text-[11px]">
                                                    {place.website ? (
                                                        <span className="text-blue-600 flex items-center gap-1 truncate max-w-[150px]">
                                                            <Globe className="w-3 h-3 shrink-0" />
                                                            {place.website.replace(/^https?:\/\//, "")}
                                                        </span>
                                                    ) : (
                                                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 border-0 text-[10px]">
                                                            Sem site próprio
                                                        </Badge>
                                                    )}

                                                    {place.rating && (
                                                        <span className="text-amber-600 font-semibold">
                                                            ⭐ {place.rating} ({place.reviews || 0})
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Redes Sociais e E-mail extraídos */}
                                                {(place.email || place.instagram || place.facebook) && (
                                                    <div className="flex flex-wrap gap-1 pt-1.5 border-t border-slate-100">
                                                        {place.email && (
                                                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono truncate max-w-[180px]">
                                                                ✉️ {place.email}
                                                            </span>
                                                        )}
                                                        {place.instagram && (
                                                            <a
                                                                href={place.instagram}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-[10px] bg-pink-50 text-pink-700 hover:underline px-1.5 py-0.5 rounded font-semibold"
                                                            >
                                                                📸 Instagram
                                                            </a>
                                                        )}
                                                        {place.facebook && (
                                                            <a
                                                                href={place.facebook}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-[10px] bg-indigo-50 text-indigo-700 hover:underline px-1.5 py-0.5 rounded font-semibold"
                                                            >
                                                                👤 Facebook
                                                            </a>
                                                        )}
                                                    </div>
                                                )}

                                                {place.alreadySaved && (
                                                    <p className="text-[10px] text-slate-400 italic pt-1">Já cadastrado anteriormente</p>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* ────────────────── ABA 2: CAMPANHA & DISPARO ────────────────── */}
                <TabsContent value="campaign" className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Lista de campanhas */}
                        <Card className="lg:col-span-1">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                                    <span>Campanhas de Prospecção</span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        onClick={() => setNewCampaignName(`Campanha ${campaigns.length + 1}`)}
                                    >
                                        <Plus className="w-3.5 h-3.5 mr-1" /> Nova
                                    </Button>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {newCampaignName && (
                                    <div className="p-3 border rounded-xl bg-slate-50 space-y-2">
                                        <label className="text-xs font-semibold text-slate-700">Nome da Nova Campanha</label>
                                        <Input
                                            value={newCampaignName}
                                            onChange={(e) => setNewCampaignName(e.target.value)}
                                            placeholder="Ex: Barbearias SP - Março"
                                            className="h-8 text-xs"
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={handleCreateCampaign}
                                                disabled={creatingCampaign}
                                                className="bg-blue-600 text-white h-7 text-xs flex-1"
                                            >
                                                Salvar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setNewCampaignName("")}
                                                className="h-7 text-xs"
                                            >
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                                    {campaigns.map((camp) => {
                                        const isSel = selectedCampaign?.id === camp.id;
                                        return (
                                            <div
                                                key={camp.id}
                                                onClick={() => setSelectedCampaign(camp)}
                                                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                                    isSel ? "border-blue-500 bg-blue-50/50" : "border-slate-200 hover:bg-slate-50"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-semibold text-xs text-slate-800 line-clamp-1">{camp.name}</span>
                                                    <Badge
                                                        className={`text-[10px] ${
                                                            camp.status === "RUNNING"
                                                                ? "bg-emerald-500 text-white animate-pulse"
                                                                : camp.status === "PAUSED"
                                                                ? "bg-amber-500 text-white"
                                                                : camp.status === "DONE"
                                                                ? "bg-blue-500 text-white"
                                                                : "bg-slate-200 text-slate-700"
                                                        }`}
                                                    >
                                                        {camp.status}
                                                    </Badge>
                                                </div>
                                                <div className="text-[11px] text-slate-500 flex justify-between">
                                                    <span>{camp.totalLeads || 0} leads na lista</span>
                                                    <span className="text-emerald-600 font-medium">{camp.interested || 0} interessados</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Detalhes e Disparo da Campanha Selecionada */}
                        <Card className="lg:col-span-2">
                            <CardHeader className="pb-3">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                    <div>
                                        <CardTitle className="text-base font-bold text-slate-800">
                                            {selectedCampaign?.name || "Selecione uma campanha"}
                                        </CardTitle>
                                        <CardDescription className="text-xs">
                                            Configure a primeira mensagem e inicie os disparos controlados com intervalos anti-ban.
                                        </CardDescription>
                                    </div>

                                    {selectedCampaign && (
                                        <div className="flex items-center gap-2">
                                            {selectedCampaign.status === "RUNNING" ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleCampaignAction(selectedCampaign.id, "pause")}
                                                    className="border-amber-500 text-amber-600 hover:bg-amber-50 gap-1.5 h-8 text-xs font-semibold"
                                                >
                                                    <Pause className="w-3.5 h-3.5" /> Pausar
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleCampaignAction(selectedCampaign.id, "start")}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs font-semibold shadow-sm"
                                                >
                                                    <Play className="w-3.5 h-3.5" /> Iniciar Disparos
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleCampaignAction(selectedCampaign.id, "reset")}
                                                title="Resetar leads com erro para tentar novamente"
                                                className="h-8 text-xs text-slate-500"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                {selectedCampaign ? (
                                    <>
                                        {/* Status / Alerta de Pausa */}
                                        {selectedCampaign.pauseReason && (
                                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                                                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="font-semibold">Campanha pausada automaticamente:</p>
                                                    <p>{selectedCampaign.pauseReason}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Métricas rápidas */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            <div className="p-3 bg-slate-50 rounded-xl border text-center">
                                                <p className="text-[11px] text-slate-500 uppercase font-semibold">Total Leads</p>
                                                <p className="text-xl font-bold text-slate-800">{selectedCampaign.totalLeads || 0}</p>
                                            </div>
                                            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-center">
                                                <p className="text-[11px] text-blue-600 uppercase font-semibold">Contactados</p>
                                                <p className="text-xl font-bold text-blue-700">{selectedCampaign.contacted || 0}</p>
                                            </div>
                                            <div className="p-3 bg-purple-50 rounded-xl border border-purple-100 text-center">
                                                <p className="text-[11px] text-purple-600 uppercase font-semibold">Conversando</p>
                                                <p className="text-xl font-bold text-purple-700">{selectedCampaign.conversing || 0}</p>
                                            </div>
                                            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                                                <p className="text-[11px] text-emerald-600 uppercase font-semibold">🔥 Interessados</p>
                                                <p className="text-xl font-bold text-emerald-700">{selectedCampaign.interested || 0}</p>
                                            </div>
                                        </div>

                                        {/* Template da 1ª mensagem */}
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center text-xs">
                                                <label className="font-semibold text-slate-700">Mensagem de Abertura (1º Contato)</label>
                                                <span className="text-[11px] text-slate-400">
                                                    Variáveis: <code>{"{nome}"}</code>, <code>{"{primeiro_nome}"}</code>, <code>{"{cidade}"}</code>, Spintax: <code>{"{Oi|Olá}"}</code>
                                                </span>
                                            </div>
                                            <Textarea
                                                rows={5}
                                                value={openingTemplate}
                                                onChange={(e) => setOpeningTemplate(e.target.value)}
                                                className="text-xs font-mono"
                                            />
                                        </div>

                                        {/* Dica de segurança */}
                                        <div className="p-3 bg-slate-50 border rounded-xl text-xs text-slate-600 space-y-1">
                                            <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                                                <ShieldAlert className="w-4 h-4 text-blue-600" />
                                                <span>Proteção Anti-Ban Ativa</span>
                                            </div>
                                            <p className="text-[11px]">
                                                Intervalo configurado de <strong>{config?.minDelaySec || 90}s a {config?.maxDelaySec || 240}s</strong> entre cada disparo, simulação de digitação e pausa automática no limite diário ({config?.dailyLimit || 40}/dia).
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <div className="p-8 text-center text-slate-400 text-sm">
                                        Nenhuma campanha selecionada. Crie ou escolha uma à esquerda.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ────────────────── ABA 3: CONVERSAS IA ────────────────── */}
                <TabsContent value="conversations" className="space-y-4">
                    {/* Filtros de status */}
                    <div className="flex flex-wrap items-center gap-2 pb-1">
                        {[
                            { key: "ALL", label: "Todos os Leads" },
                            { key: "INTERESTED", label: "🔥 Interessados", badgeClass: "bg-emerald-600" },
                            { key: "CONVERSING", label: "💬 Em Conversa", badgeClass: "bg-purple-600" },
                            { key: "CONTACTED", label: "Disparados", badgeClass: "bg-blue-600" },
                            { key: "NOT_INTERESTED", label: "Sem Interesse", badgeClass: "bg-slate-500" },
                        ].map((btn) => (
                            <Button
                                key={btn.key}
                                size="sm"
                                variant={statusFilter === btn.key ? "default" : "outline"}
                                onClick={() => setStatusFilter(btn.key)}
                                className="h-8 text-xs gap-1.5"
                            >
                                <span>{btn.label}</span>
                                {statusCounts[btn.key] ? (
                                    <Badge variant="secondary" className={`text-[10px] px-1 py-0 ${btn.badgeClass || ""}`}>
                                        {statusCounts[btn.key]}
                                    </Badge>
                                ) : null}
                            </Button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Lista de Leads */}
                        <Card className="lg:col-span-1">
                            <CardHeader className="p-3 border-b">
                                <CardTitle className="text-xs font-semibold uppercase text-slate-500">
                                    Contatos ({leads.length})
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-2 space-y-1 max-h-[550px] overflow-y-auto">
                                {leads.length === 0 ? (
                                    <p className="p-4 text-center text-xs text-slate-400">Nenhum lead com este filtro.</p>
                                ) : (
                                    leads.map((l) => {
                                        const isSelected = selectedLead?.id === l.id;
                                        return (
                                            <div
                                                key={l.id}
                                                onClick={() => openLeadChat(l)}
                                                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                                                    isSelected
                                                        ? "border-blue-500 bg-blue-50/60"
                                                        : l.status === "INTERESTED"
                                                        ? "border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50"
                                                        : "border-slate-200 hover:bg-slate-50"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-1 mb-1">
                                                    <span className="font-semibold text-xs text-slate-800 line-clamp-1">{l.name}</span>
                                                    {l.status === "INTERESTED" ? (
                                                        <Badge className="bg-emerald-600 text-[10px] text-white">Interessado</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[10px] text-slate-500">
                                                            {l.status}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <p className="text-[11px] text-slate-500 font-mono mb-1">{l.phone}</p>

                                                {l.aiSummary && (
                                                    <p className="text-[11px] text-slate-600 italic line-clamp-1 bg-white/60 p-1 rounded border">
                                                        "{l.aiSummary}"
                                                    </p>
                                                )}

                                                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2">
                                                    <span>{l.city || l.category || "Lead local"}</span>
                                                    {l.aiPaused ? (
                                                        <span className="text-amber-600 font-semibold">IA Pausada (Manual)</span>
                                                    ) : (
                                                        <span className="text-purple-600 font-semibold">IA Ativa</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </CardContent>
                        </Card>

                        {/* Visualizador de Conversa & Resposta Manual */}
                        <Card className="lg:col-span-2 flex flex-col h-[600px]">
                            {selectedLead ? (
                                <>
                                    {/* Cabeçalho do Chat */}
                                    <div className="p-3 border-b flex items-center justify-between bg-slate-50">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                                                {selectedLead.name.charAt(0)}
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-xs text-slate-800">{selectedLead.name}</h3>
                                                <p className="text-[10px] text-slate-500">
                                                    {selectedLead.phone} • {selectedLead.city || "Brasil"}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant={selectedLead.aiPaused ? "default" : "outline"}
                                                onClick={() => toggleLeadAi(selectedLead.id, selectedLead.aiPaused)}
                                                className={`h-7 text-xs ${
                                                    selectedLead.aiPaused
                                                        ? "bg-amber-600 hover:bg-amber-700 text-white"
                                                        : "border-slate-300 text-slate-700"
                                                }`}
                                            >
                                                {selectedLead.aiPaused ? "Retomar IA" : "Pausar IA & Assumir"}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Histórico de Mensagens */}
                                    <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/30">
                                        {leadMessages.map((m) => (
                                            <div
                                                key={m.id}
                                                className={`flex flex-col ${m.fromMe ? "items-end" : "items-start"}`}
                                            >
                                                <div
                                                    className={`max-w-[80%] p-3 rounded-2xl text-xs whitespace-pre-wrap leading-relaxed shadow-sm ${
                                                        m.fromMe
                                                            ? m.byAI
                                                                ? "bg-purple-600 text-white rounded-tr-none"
                                                                : "bg-blue-600 text-white rounded-tr-none"
                                                            : "bg-white text-slate-800 border rounded-tl-none"
                                                    }`}
                                                >
                                                    {m.content}
                                                </div>
                                                <span className="text-[10px] text-slate-400 mt-1 px-1">
                                                    {m.fromMe ? (m.byAI ? "🤖 IA" : "👤 Você") : "Cliente"} •{" "}
                                                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Barra de Envio Manual */}
                                    <div className="p-3 border-t bg-white flex gap-2">
                                        <Input
                                            placeholder="Digite uma mensagem manual (pausa a IA automaticamente)..."
                                            value={manualReply}
                                            onChange={(e) => setManualReply(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSendManual();
                                                }
                                            }}
                                            className="text-xs"
                                        />
                                        <Button
                                            onClick={handleSendManual}
                                            disabled={sendingManual || !manualReply.trim()}
                                            className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 text-xs"
                                        >
                                            <Send className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-2">
                                    <MessageSquare className="w-10 h-10 stroke-[1.5]" />
                                    <p className="text-sm">Selecione um lead à esquerda para visualizar e interagir na conversa.</p>
                                </div>
                            )}
                        </Card>
                    </div>
                </TabsContent>

                {/* ────────────────── ABA 4: CONFIGURAÇÕES & OFERTA ────────────────── */}
                <TabsContent value="settings" className="space-y-4">
                    <form onSubmit={saveConfig}>
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base font-bold flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-purple-600" />
                                    Configurações da Inteligência Artificial & Limites
                                </CardTitle>
                                <CardDescription>
                                    Defina o que o Gemini deve saber sobre seus serviços e como ele deve se comportar durante a negociação.
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Chaves de API */}
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-700">Chave Google Gemini (API Key)</label>
                                        <Input
                                            type="password"
                                            placeholder="AIzaSy..."
                                            value={config?.geminiApiKey || ""}
                                            onChange={(e) => setConfig({ ...config, geminiApiKey: e.target.value })}
                                            className="text-xs font-mono"
                                        />
                                        <p className="text-[11px] text-slate-500">
                                            Obtenha grátis em <a href="https://aistudio.google.com/apikey" target="_blank" className="text-blue-600 underline">aistudio.google.com</a>
                                        </p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-700">Chave Google Maps Places (API Key)</label>
                                        <Input
                                            type="password"
                                            placeholder="AIzaSy..."
                                            value={config?.mapsApiKey || ""}
                                            onChange={(e) => setConfig({ ...config, mapsApiKey: e.target.value })}
                                            className="text-xs font-mono"
                                        />
                                        <p className="text-[11px] text-slate-500">
                                            Necessária para buscar empresas no Google Maps com Places API (New).
                                        </p>
                                    </div>
                                </div>

                                {/* Persona & Notificação */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-700">Nome / Persona do Vendedor</label>
                                        <Input
                                            placeholder="Ex: Marcos, da Agência Web"
                                            value={config?.persona || ""}
                                            onChange={(e) => setConfig({ ...config, persona: e.target.value })}
                                            className="text-xs"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-700">WhatsApp Pessoal para Avisos (Opcional)</label>
                                        <Input
                                            placeholder="Ex: 5511999998888 (com DDI e DDD)"
                                            value={config?.notifyPhone || ""}
                                            onChange={(e) => setConfig({ ...config, notifyPhone: e.target.value })}
                                            className="text-xs font-mono"
                                        />
                                        <p className="text-[11px] text-slate-500">Receba uma mensagem quando um lead demonstrar interesse.</p>
                                    </div>
                                </div>

                                {/* Texto da Oferta de Sites */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700">
                                        Texto da sua Oferta (Serviços, Preços, Prazos e Portfólio)
                                    </label>
                                    <Textarea
                                        rows={6}
                                        value={config?.offerText || ""}
                                        onChange={(e) => setConfig({ ...config, offerText: e.target.value })}
                                        placeholder="Descreva aqui o que você vende, prazos, formas de pagamento e diferenciais..."
                                        className="text-xs leading-relaxed"
                                    />
                                    <p className="text-[11px] text-slate-500">
                                        A IA usará estritamente essas informações para tirar dúvidas e negociar com o lead.
                                    </p>
                                </div>

                                {/* Regras Adicionais */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-slate-700">Regras e Instruções Especiais para a IA</label>
                                    <Input
                                        placeholder="Ex: Não mencione preços logo no início; peça para agendar uma call de 10 minutos."
                                        value={config?.extraRules || ""}
                                        onChange={(e) => setConfig({ ...config, extraRules: e.target.value })}
                                        className="text-xs"
                                    />
                                </div>

                                {/* Limites de Disparo */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t">
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-600">Limite Diário (Novos Leads)</label>
                                        <Input
                                            type="number"
                                            value={config?.dailyLimit ?? 40}
                                            onChange={(e) => setConfig({ ...config, dailyLimit: Number(e.target.value) })}
                                            className="text-xs h-8"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-600">Delay Mínimo (segundos)</label>
                                        <Input
                                            type="number"
                                            value={config?.minDelaySec ?? 90}
                                            onChange={(e) => setConfig({ ...config, minDelaySec: Number(e.target.value) })}
                                            className="text-xs h-8"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-600">Delay Máximo (segundos)</label>
                                        <Input
                                            type="number"
                                            value={config?.maxDelaySec ?? 240}
                                            onChange={(e) => setConfig({ ...config, maxDelaySec: Number(e.target.value) })}
                                            className="text-xs h-8"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-slate-600">Horário Comercial (Início / Fim)</label>
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="number"
                                                value={config?.workStart ?? 9}
                                                onChange={(e) => setConfig({ ...config, workStart: Number(e.target.value) })}
                                                className="text-xs h-8 w-14"
                                            />
                                            <span className="text-xs text-slate-400">às</span>
                                            <Input
                                                type="number"
                                                value={config?.workEnd ?? 18}
                                                onChange={(e) => setConfig({ ...config, workEnd: Number(e.target.value) })}
                                                className="text-xs h-8 w-14"
                                            />
                                            <span className="text-xs text-slate-400">h</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end pt-2">
                                    <Button
                                        type="submit"
                                        disabled={savingConfig}
                                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs gap-1.5"
                                    >
                                        <Check className="w-4 h-4" />
                                        Salvar Configurações
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </form>
                </TabsContent>
            </Tabs>
        
            {/* Modal de Detalhes Completos da Empresa */}
            {viewingPlace && (
                <div 
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
                    onClick={() => setViewingPlace(null)}
                >
                    <div 
                        className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 border-b pb-3">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">{viewingPlace.name}</h2>
                                <p className="text-xs text-slate-500">{viewingPlace.category || "Empresa local"}</p>
                            </div>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full" onClick={() => setViewingPlace(null)}>
                                ✕
                            </Button>
                        </div>

                        <div className="space-y-3 text-xs text-slate-700">
                            {/* Telefone */}
                            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border">
                                <span className="font-semibold flex items-center gap-1.5 text-slate-600">
                                    <Phone className="w-4 h-4 text-emerald-600" /> Telefone / WhatsApp:
                                </span>
                                <span className="font-mono font-bold text-slate-900 text-sm">
                                    {viewingPlace.rawPhone || viewingPlace.phone || "Não informado"}
                                </span>
                            </div>

                            {/* Endereço */}
                            <div className="p-2.5 bg-slate-50 rounded-xl border space-y-1">
                                <span className="font-semibold flex items-center gap-1.5 text-slate-600">
                                    <MapPin className="w-4 h-4 text-rose-500" /> Endereço Completo:
                                </span>
                                <p className="text-slate-800 pl-5">{viewingPlace.address || "Não informado"}</p>
                            </div>

                            {/* Site */}
                            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border">
                                <span className="font-semibold flex items-center gap-1.5 text-slate-600">
                                    <Globe className="w-4 h-4 text-blue-500" /> Website Oficial:
                                </span>
                                {viewingPlace.website ? (
                                    <a href={viewingPlace.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium truncate max-w-[250px]">
                                        {viewingPlace.website}
                                    </a>
                                ) : (
                                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">
                                        Sem site cadastrado
                                    </Badge>
                                )}
                            </div>

                            {/* Redes Sociais e E-mail */}
                            {(viewingPlace.email || viewingPlace.instagram || viewingPlace.facebook || viewingPlace.linkedin) && (
                                <div className="p-2.5 bg-purple-50/60 rounded-xl border border-purple-200 space-y-2">
                                    <p className="font-semibold text-purple-900">🌐 Informações Enriquecidas:</p>
                                    <div className="space-y-1 pl-2">
                                        {viewingPlace.email && (
                                            <p className="flex items-center gap-1.5">
                                                <span className="text-slate-500">E-mail:</span>
                                                <a href={`mailto:${viewingPlace.email}`} className="text-blue-600 font-mono underline font-medium">
                                                    {viewingPlace.email}
                                                </a>
                                            </p>
                                        )}
                                        {viewingPlace.instagram && (
                                            <p className="flex items-center gap-1.5">
                                                <span className="text-slate-500">Instagram:</span>
                                                <a href={viewingPlace.instagram} target="_blank" rel="noreferrer" className="text-pink-600 hover:underline font-semibold">
                                                    {viewingPlace.instagram}
                                                </a>
                                            </p>
                                        )}
                                        {viewingPlace.facebook && (
                                            <p className="flex items-center gap-1.5">
                                                <span className="text-slate-500">Facebook:</span>
                                                <a href={viewingPlace.facebook} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline font-semibold">
                                                    {viewingPlace.facebook}
                                                </a>
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Google Maps link */}
                            {viewingPlace.mapsUrl && (
                                <div className="pt-2">
                                    <a 
                                        href={viewingPlace.mapsUrl} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-semibold text-xs transition-colors"
                                    >
                                        <ArrowUpRight className="w-4 h-4 text-blue-600" />
                                        Abrir Ficha no Google Maps / Google Business
                                    </a>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={selectedPlaces.has(viewingPlace.placeId)}
                                    onChange={() => {
                                        const next = new Set(selectedPlaces);
                                        if (next.has(viewingPlace.placeId)) next.delete(viewingPlace.placeId);
                                        else next.add(viewingPlace.placeId);
                                        setSelectedPlaces(next);
                                    }}
                                    className="w-4 h-4 rounded text-blue-600"
                                />
                                Selecionar para disparo
                            </label>

                            <Button 
                                size="sm" 
                                onClick={() => {
                                    const next = new Set(selectedPlaces);
                                    next.add(viewingPlace.placeId);
                                    setSelectedPlaces(next);
                                    setViewingPlace(null);
                                    toast.success("Empresa adicionada à seleção!");
                                }}
                                className="bg-blue-600 text-white text-xs"
                            >
                                Selecionar & Fechar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
