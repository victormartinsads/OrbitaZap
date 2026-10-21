"use client";

import { useState } from "react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
    MessageSquare,
    Phone,
    Mail,
    Building2,
    DollarSign,
    Calendar,
    Tag,
    Trash2,
    Save,
    Send,
    Clock,
    User,
    CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface LeadDetailSheetProps {
    lead: any | null;
    stages: any[];
    isOpen: boolean;
    onClose: () => void;
    onUpdate: () => void;
}

export function LeadDetailSheet({ lead, stages, isOpen, onClose, onUpdate }: LeadDetailSheetProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [noteText, setNoteText] = useState("");
    const [editData, setEditData] = useState<any>(null);

    // Quando o lead é aberto, preenche o form de edição
    const currentLead = editData || lead;

    const handleFieldChange = (field: string, value: any) => {
        setEditData((prev: any) => ({
            ...(prev || lead),
            [field]: value
        }));
    };

    const handleSave = async () => {
        if (!lead?.id) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/crm/leads/${lead.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editData || {})
            });
            if (res.ok) {
                toast.success("Lead atualizado com sucesso!");
                setEditData(null);
                onUpdate();
            } else {
                toast.error("Erro ao salvar alterações");
            }
        } catch (e) {
            toast.error("Erro de conexão");
        } finally {
            setLoading(false);
        }
    };

    const handleAddNote = async () => {
        if (!noteText.trim() || !lead?.id) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/crm/leads/${lead.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newNote: noteText })
            });
            if (res.ok) {
                toast.success("Nota interna adicionada!");
                setNoteText("");
                onUpdate();
            }
        } catch (e) {
            toast.error("Erro ao adicionar nota");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!lead?.id || !confirm("Tem certeza que deseja excluir este lead?")) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/crm/leads/${lead.id}`, { method: "DELETE" });
            if (res.ok) {
                toast.success("Lead removido com sucesso!");
                onClose();
                onUpdate();
            }
        } catch (e) {
            toast.error("Erro ao excluir lead");
        } finally {
            setLoading(false);
        }
    };

    const openWhatsAppChat = () => {
        if (!currentLead?.remoteJid) {
            toast.error("Lead sem número de WhatsApp cadastrado");
            return;
        }
        router.push(`/dashboard/chat?jid=${encodeURIComponent(currentLead.remoteJid)}`);
    };

    if (!lead) return null;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="sm:max-w-xl w-full p-0 flex flex-col bg-slate-50 overflow-hidden">
                {/* Header Superior Clean */}
                <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                {currentLead.source || "LEAD"}
                            </span>
                            <Badge variant="outline" className="text-[11px] font-medium border-slate-200 text-slate-600">
                                {currentLead.priority}
                            </Badge>
                        </div>
                        <SheetTitle className="text-xl font-bold text-slate-900 mt-1">
                            {currentLead.name}
                        </SheetTitle>
                    </div>

                    <div className="flex items-center gap-2">
                        {currentLead.remoteJid && (
                            <Button
                                size="sm"
                                onClick={openWhatsAppChat}
                                className="bg-[#00bcfe] hover:bg-[#0084cc] text-white text-xs font-semibold rounded-xl h-9 gap-1.5 shadow-2xs"
                            >
                                <MessageSquare size={14} />
                                Abrir no WhatsApp
                            </Button>
                        )}
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={handleDelete}
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl h-9 w-9"
                        >
                            <Trash2 size={16} />
                        </Button>
                    </div>
                </div>

                {/* Conteúdo com Scroll */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Etapa e Valor do Negócio */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500">Etapa do Funil</Label>
                            <Select
                                value={currentLead.stageId}
                                onValueChange={(val) => handleFieldChange("stageId", val)}
                            >
                                <SelectTrigger className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200">
                                    <SelectValue placeholder="Selecione a etapa" />
                                </SelectTrigger>
                                <SelectContent>
                                    {stages.map((st) => (
                                        <SelectItem key={st.id} value={st.id} className="text-xs">
                                            {st.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-500">Valor da Oportunidade (R$)</Label>
                            <div className="relative">
                                <DollarSign size={14} className="absolute left-3 top-2.5 text-slate-400" />
                                <Input
                                    type="number"
                                    value={currentLead.value}
                                    onChange={(e) => handleFieldChange("value", e.target.value)}
                                    className="pl-8 h-9 text-xs rounded-xl bg-slate-50 border-slate-200 font-semibold text-slate-800"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Dados de Contato e Empresa */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            Informações de Contato
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600 font-medium">Nome Completo</Label>
                                <Input
                                    value={currentLead.name || ""}
                                    onChange={(e) => handleFieldChange("name", e.target.value)}
                                    className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600 font-medium">WhatsApp / Telefone</Label>
                                <Input
                                    value={currentLead.phone || ""}
                                    placeholder="5511999999999"
                                    onChange={(e) => handleFieldChange("phone", e.target.value)}
                                    className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600 font-medium">E-mail</Label>
                                <Input
                                    type="email"
                                    value={currentLead.email || ""}
                                    onChange={(e) => handleFieldChange("email", e.target.value)}
                                    className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600 font-medium">Empresa</Label>
                                <Input
                                    value={currentLead.company || ""}
                                    onChange={(e) => handleFieldChange("company", e.target.value)}
                                    className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5 pt-2">
                            <Label className="text-xs text-slate-600 font-medium">Observações Gerais</Label>
                            <Textarea
                                rows={2}
                                value={currentLead.notes || ""}
                                onChange={(e) => handleFieldChange("notes", e.target.value)}
                                placeholder="Anotações sobre o cliente ou negociação..."
                                className="text-xs rounded-xl bg-slate-50 border-slate-200 resize-none"
                            />
                        </div>

                        {editData && (
                            <div className="pt-2 flex justify-end">
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={loading}
                                    className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl h-8 gap-1.5"
                                >
                                    <Save size={14} />
                                    Salvar Alterações
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Campos Personalizados (Custom Fields / Meta Form) */}
                    {currentLead.customFields && Object.keys(currentLead.customFields).length > 0 && (
                        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Respostas do Formulário / Dados Extras
                            </h4>
                            <div className="grid grid-cols-1 gap-2.5">
                                {Object.entries(currentLead.customFields).map(([key, val]: any) => (
                                    <div key={key} className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start justify-between">
                                        <span className="text-[11px] font-semibold text-slate-500 uppercase">{key}</span>
                                        <span className="text-xs font-medium text-slate-800 max-w-[280px] text-right truncate">
                                            {typeof val === "object" ? JSON.stringify(val) : String(val)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Linha do Tempo e Notas Internas */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            Linha do Tempo & Histórico
                        </h4>

                        {/* Input de nova nota */}
                        <div className="flex gap-2">
                            <Input
                                placeholder="Adicionar nota interna na timeline..."
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                                className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200 flex-1"
                            />
                            <Button
                                size="sm"
                                onClick={handleAddNote}
                                disabled={loading || !noteText.trim()}
                                className="bg-[#00bcfe] hover:bg-[#0084cc] text-white rounded-xl h-9 px-3"
                            >
                                <Send size={14} />
                            </Button>
                        </div>

                        {/* Lista de Atividades */}
                        <div className="space-y-3 pt-2">
                            {currentLead.activities?.map((act: any) => (
                                <div key={act.id} className="flex gap-3 text-xs items-start">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-slate-500">
                                        <Clock size={12} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <p className="font-semibold text-slate-800">{act.title}</p>
                                            <span className="text-[10px] text-slate-400">
                                                {new Date(act.createdAt).toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                        </div>
                                        {act.content && (
                                            <p className="text-slate-600 mt-0.5 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                {act.content}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
