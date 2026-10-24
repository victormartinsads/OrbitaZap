"use client";

import { useState, useEffect } from "react";
import {
    LayoutDashboard,
    Plus,
    Search,
    SlidersHorizontal,
    Share2,
    DollarSign,
    Phone,
    MessageSquare,
    MoreVertical,
    Clock,
    User,
    ChevronRight,
    RefreshCw,
    Sparkles,
    CheckCircle2,
    Send,
    CheckSquare,
    Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { LeadDetailSheet } from "@/components/crm/lead-detail-sheet";
import { NewLeadModal } from "@/components/crm/new-lead-modal";
import { ImportLeadsModal } from "@/components/crm/import-leads-modal";
import { IntegrationsModal } from "@/components/crm/integrations-modal";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function CRMPage() {
    const router = useRouter();
    const [pipelines, setPipelines] = useState<any[]>([]);
    const [selectedPipeline, setSelectedPipeline] = useState<any>(null);
    const [leads, setLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Seleção em massa para disparos/movimentação
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [isBulkMoving, setIsBulkMoving] = useState(false);

    // Modais
    const [selectedLead, setSelectedLead] = useState<any | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isNewLeadOpen, setIsNewLeadOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isIntegrationsOpen, setIsIntegrationsOpen] = useState(false);

    const fetchPipelines = async () => {
        try {
            const res = await fetch("/api/crm/pipelines");
            const data = await res.json();
            if (data.pipelines && data.pipelines.length > 0) {
                setPipelines(data.pipelines);
                if (!selectedPipeline) {
                    setSelectedPipeline(data.pipelines[0]);
                }
            }
        } catch (e) {
            console.error("Erro ao carregar pipelines:", e);
        }
    };

    const fetchLeads = async (pipelineId?: string) => {
        setLoading(true);
        try {
            const pId = pipelineId || selectedPipeline?.id;
            const url = pId ? `/api/crm/leads?pipelineId=${pId}` : "/api/crm/leads";
            const res = await fetch(url);
            const data = await res.json();
            if (data.leads) {
                setLeads(data.leads);
            }
        } catch (e) {
            toast.error("Erro ao carregar leads");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPipelines();
    }, []);

    useEffect(() => {
        if (selectedPipeline?.id) {
            fetchLeads(selectedPipeline.id);
        }
    }, [selectedPipeline]);

    // Manipulação de Drag & Drop nativo
    const handleDragStart = (e: React.DragEvent, leadId: string) => {
        e.dataTransfer.setData("text/plain", leadId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent, targetStageId: string) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData("text/plain");
        if (!leadId) return;

        // Se o lead arrastado estava entre os selecionados, move todos os selecionados juntos!
        const leadsToMove = selectedLeadIds.has(leadId) && selectedLeadIds.size > 1
            ? Array.from(selectedLeadIds)
            : [leadId];

        // Atualização Otimista da UI
        setLeads(prev => prev.map(l => leadsToMove.includes(l.id) ? { ...l, stageId: targetStageId } : l));

        const targetStage = stages.find((s: any) => s.id === targetStageId);
        const isFirstContact = targetStage?.autoFirstContact === true;

        if (leadsToMove.length > 1) {
            // Mover em lote
            await handleBulkMove(leadsToMove, targetStageId);
        } else {
            // Mover individual
            try {
                const res = await fetch(`/api/crm/leads/${leadId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ stageId: targetStageId })
                });
                if (res.ok) {
                    if (isFirstContact) {
                        toast.success("Lead movido para Primeiro Contato! Mensagem de abordagem enviada via WhatsApp.");
                    } else {
                        toast.success("Lead movido!");
                    }
                    fetchLeads();
                } else {
                    fetchLeads();
                }
            } catch (err) {
                fetchLeads();
            }
        }
    };

    // Mover múltiplos leads para uma etapa (com disparo automático em Primeiro Contato)
    const handleBulkMove = async (leadIds: string[], targetStageId: string) => {
        try {
            setIsBulkMoving(true);
            const targetStage = stages.find((s: any) => s.id === targetStageId);
            const isFirstContact = targetStage?.autoFirstContact === true;

            const res = await fetch("/api/crm/leads/bulk-move", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leadIds, targetStageId }),
            });
            const data = await res.json();
            if (data.success) {
                if (isFirstContact) {
                    toast.success(
                        `${data.dispatchedCount} de ${data.totalMoved} mensagens de abordagem disparadas com sucesso!`,
                        { duration: 5000 }
                    );
                } else {
                    toast.success(`${data.totalMoved} leads movidos para ${targetStage?.name || "a etapa"}!`);
                }
                setSelectedLeadIds(new Set());
                fetchLeads();
            } else {
                toast.error(data.error || "Erro ao mover leads");
                fetchLeads();
            }
        } catch (e) {
            toast.error("Falha ao mover leads");
            fetchLeads();
        } finally {
            setIsBulkMoving(false);
        }
    };

    const toggleSelectLead = (e: React.MouseEvent, leadId: string) => {
        e.stopPropagation();
        const next = new Set(selectedLeadIds);
        if (next.has(leadId)) next.delete(leadId);
        else next.add(leadId);
        setSelectedLeadIds(next);
    };

    const openLead = (lead: any) => {
        setSelectedLead(lead);
        setIsDetailOpen(true);
    };

    const filteredLeads = leads.filter(l => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            l.name?.toLowerCase().includes(q) ||
            l.phone?.includes(q) ||
            l.email?.toLowerCase().includes(q) ||
            l.company?.toLowerCase().includes(q)
        );
    });

    const stages = selectedPipeline?.stages || [];
    const firstContactStage = stages.find((s: any) => s.autoFirstContact === true);
    const totalPipelineValue = filteredLeads.reduce((acc, curr) => acc + (parseFloat(curr.value) || 0), 0);

    return (
        <div className="flex flex-col h-[calc(100vh-70px)] bg-slate-50/70 overflow-hidden">
            {/* Header da Tela CRM */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#00bcfe]/12 border border-[#00bcfe]/20 flex items-center justify-center text-[#0084cc]">
                        <LayoutDashboard size={20} />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold tracking-tight text-slate-900">CRM & Funil de Vendas</h1>
                            <Link href="/dashboard/prospect">
                                <Badge className="bg-purple-100 hover:bg-purple-200 text-purple-700 border-purple-200 gap-1 text-[11px] cursor-pointer">
                                    <Sparkles size={11} /> Extrair do Google Maps
                                </Badge>
                            </Link>
                        </div>
                        <p className="text-xs text-slate-500">
                            {filteredLeads.length} oportunidades • Total em negociação:{" "}
                            <span className="font-semibold text-slate-800">
                                {totalPipelineValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Barra de ação rápida para leads selecionados */}
                    {selectedLeadIds.size > 0 && firstContactStage && (
                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 p-1 px-2 rounded-xl text-xs">
                            <span className="font-bold text-amber-800">{selectedLeadIds.size} selecionados</span>
                            <Button
                                size="sm"
                                disabled={isBulkMoving}
                                onClick={() => handleBulkMove(Array.from(selectedLeadIds), firstContactStage.id)}
                                className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1 shadow-2xs"
                            >
                                <Send size={12} />
                                Disparar Primeiro Contato ({selectedLeadIds.size})
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedLeadIds(new Set())}
                                className="h-7 text-xs text-slate-500"
                            >
                                Limpar
                            </Button>
                        </div>
                    )}

                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                        <Input
                            placeholder="Buscar lead, telefone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-9 text-xs rounded-xl bg-slate-50 border-slate-200 w-[200px] focus-visible:ring-[#00bcfe]"
                        />
                    </div>

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsImportOpen(true)}
                        className="h-9 rounded-xl border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 gap-1.5"
                    >
                        <Upload size={14} className="text-[#00bcfe]" />
                        Importar CSV
                    </Button>

                    <Button
                        size="sm"
                        onClick={() => setIsNewLeadOpen(true)}
                        className="h-9 rounded-xl bg-[#00bcfe] hover:bg-[#0084cc] text-white text-xs font-semibold gap-1.5 shadow-2xs"
                    >
                        <Plus size={15} />
                        Novo Lead
                    </Button>
                </div>
            </div>

            {/* Kanban Board Container */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
                <div className="flex gap-4 h-full items-start min-w-max pb-4">
                    {stages.map((stage: any) => {
                        const stageLeads = filteredLeads.filter(l => l.stageId === stage.id);
                        const stageTotal = stageLeads.reduce((acc, c) => acc + (parseFloat(c.value) || 0), 0);
                        const isFirstContact = stage.autoFirstContact === true;

                        return (
                            <div
                                key={stage.id}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage.id)}
                                className={`w-[310px] max-h-full flex flex-col rounded-2xl border p-3 shadow-2xs transition-colors ${
                                    isFirstContact ? "bg-amber-50/40 border-amber-200/80" : "bg-slate-100/90 border-slate-200/80"
                                }`}
                            >
                                {/* Header da Coluna */}
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: stage.color || "#00bcfe" }}
                                        />
                                        <h3 className="text-xs font-bold text-slate-800 truncate">
                                            {stage.name}
                                        </h3>
                                        <span className="text-[11px] font-semibold text-slate-400 bg-white border border-slate-200/80 rounded-full px-2 py-0.5">
                                            {stageLeads.length}
                                        </span>
                                    </div>

                                    {/* Selecionar todos os leads desta coluna */}
                                    {stageLeads.length > 0 && (
                                        <button
                                            onClick={() => {
                                                const next = new Set(selectedLeadIds);
                                                const allSelected = stageLeads.every(l => next.has(l.id));
                                                stageLeads.forEach(l => {
                                                    if (allSelected) next.delete(l.id);
                                                    else next.add(l.id);
                                                });
                                                setSelectedLeadIds(next);
                                            }}
                                            title="Selecionar todos os leads desta coluna"
                                            className="text-[10px] font-semibold text-slate-400 hover:text-slate-700"
                                        >
                                            {stageLeads.every(l => selectedLeadIds.has(l.id)) ? "Desmarcar" : "Marcar todos"}
                                        </button>
                                    )}
                                </div>

                                {isFirstContact && (
                                    <p className="text-[10px] text-amber-700 font-medium pb-2 flex items-center gap-1">
                                        <Send size={10} /> Disparo automático da 1ª mensagem de abordagem
                                    </p>
                                )}

                                {/* Lista de Cards da Etapa */}
                                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                                    {stageLeads.map((lead: any) => {
                                        const isSelected = selectedLeadIds.has(lead.id);

                                        return (
                                            <div
                                                key={lead.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, lead.id)}
                                                onClick={() => openLead(lead)}
                                                className={`p-3.5 rounded-xl border cursor-pointer transition-all duration-150 active:opacity-60 space-y-2 group ${
                                                    isSelected
                                                        ? "bg-blue-50/80 border-[#00bcfe] shadow-xs"
                                                        : "bg-white border-slate-200 hover:border-[#00bcfe]/60 hover:shadow-xs"
                                                }`}
                                            >
                                                {/* Topo do Card */}
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-start gap-2 min-w-0">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => toggleSelectLead(e, lead.id)}
                                                            className="mt-0.5 text-slate-400 hover:text-[#00bcfe]"
                                                        >
                                                            {isSelected ? (
                                                                <CheckSquare size={14} className="text-[#00bcfe]" />
                                                            ) : (
                                                                <Square size={14} />
                                                            )}
                                                        </button>
                                                        <div className="min-w-0">
                                                            <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-[#0084cc] transition-colors">
                                                                {lead.name}
                                                            </h4>
                                                            {lead.company && (
                                                                <p className="text-[11px] text-slate-500 truncate font-medium">
                                                                    {lead.company}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {lead.source && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 uppercase border border-slate-200 shrink-0">
                                                            {lead.source.replace("_", " ")}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Detalhes rápidos: Cidade / Nicho se vier do Maps */}
                                                {(lead.customFields as any)?.city && (
                                                    <p className="text-[10px] text-slate-400 truncate pl-5">
                                                        📍 {(lead.customFields as any).city}
                                                        {(lead.customFields as any)?.category ? ` • ${(lead.customFields as any).category}` : ""}
                                                    </p>
                                                )}

                                                {/* Telefone e WhatsApp */}
                                                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 pl-5">
                                                    <span className="text-[11px] font-semibold text-slate-500 font-mono">
                                                        {lead.phone ? lead.phone : "Sem telefone"}
                                                    </span>

                                                    {lead.phone && (
                                                        <Phone size={11} className="text-emerald-500" />
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {stageLeads.length === 0 && (
                                        <div className="h-24 border border-dashed border-slate-200 rounded-xl flex items-center justify-center text-[11px] text-slate-400 font-medium">
                                            Arraste leads aqui
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modais & Drawers */}
            <LeadDetailSheet
                lead={selectedLead}
                stages={stages}
                isOpen={isDetailOpen}
                onClose={() => {
                    setIsDetailOpen(false);
                    setSelectedLead(null);
                }}
                onUpdate={() => {
                    fetchLeads();
                    if (selectedLead?.id) {
                        fetch(`/api/crm/leads/${selectedLead.id}`)
                            .then(r => r.json())
                            .then(d => d.lead && setSelectedLead(d.lead))
                            .catch(() => {});
                    }
                }}
            />

            <NewLeadModal
                isOpen={isNewLeadOpen}
                onClose={() => setIsNewLeadOpen(false)}
                pipelineId={selectedPipeline?.id}
                stages={stages}
                onCreated={() => fetchLeads()}
            />

            <ImportLeadsModal
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                pipelineId={selectedPipeline?.id}
                stages={stages}
                onImported={() => fetchLeads()}
            />

            <IntegrationsModal
                isOpen={isIntegrationsOpen}
                onClose={() => setIsIntegrationsOpen(false)}
                configs={[]}
                onRefresh={() => {}}
            />
        </div>
    );
}
