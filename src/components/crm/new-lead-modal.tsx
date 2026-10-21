"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";

interface NewLeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    pipelineId: string;
    stages: any[];
    onCreated: () => void;
}

export function NewLeadModal({ isOpen, onClose, pipelineId, stages, onCreated }: NewLeadModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        email: "",
        company: "",
        value: "0",
        stageId: stages[0]?.id || "",
        priority: "MEDIUM"
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return toast.error("Informe o nome do lead");

        setLoading(true);
        try {
            const res = await fetch("/api/crm/leads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    pipelineId,
                    stageId: formData.stageId || stages[0]?.id
                })
            });

            if (res.ok) {
                toast.success("Lead criado com sucesso!");
                setFormData({
                    name: "",
                    phone: "",
                    email: "",
                    company: "",
                    value: "0",
                    stageId: stages[0]?.id || "",
                    priority: "MEDIUM"
                });
                onCreated();
                onClose();
            } else {
                toast.error("Erro ao criar lead");
            }
        } catch (e) {
            toast.error("Erro de conexão");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md bg-white rounded-2xl border-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-slate-900">Novo Lead / Oportunidade</DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Cadastre manualmente um novo contato no seu funil comercial.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Nome do Contato *</Label>
                        <Input
                            placeholder="Ex: João Silva"
                            value={formData.name}
                            onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                            className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">WhatsApp / Telefone</Label>
                            <Input
                                placeholder="5511999999999"
                                value={formData.phone}
                                onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                                className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">E-mail</Label>
                            <Input
                                type="email"
                                placeholder="cliente@email.com"
                                value={formData.email}
                                onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                                className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Empresa</Label>
                            <Input
                                placeholder="Nome da empresa"
                                value={formData.company}
                                onChange={(e) => setFormData(p => ({ ...p, company: e.target.value }))}
                                className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Valor Estimado (R$)</Label>
                            <Input
                                type="number"
                                placeholder="0.00"
                                value={formData.value}
                                onChange={(e) => setFormData(p => ({ ...p, value: e.target.value }))}
                                className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Etapa Inicial</Label>
                            <Select
                                value={formData.stageId || stages[0]?.id}
                                onValueChange={(val) => setFormData(p => ({ ...p, stageId: val }))}
                            >
                                <SelectTrigger className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200">
                                    <SelectValue placeholder="Etapa" />
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
                            <Label className="text-xs font-semibold text-slate-700">Prioridade</Label>
                            <Select
                                value={formData.priority}
                                onValueChange={(val) => setFormData(p => ({ ...p, priority: val }))}
                            >
                                <SelectTrigger className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200">
                                    <SelectValue placeholder="Prioridade" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LOW" className="text-xs">Baixa</SelectItem>
                                    <SelectItem value="MEDIUM" className="text-xs">Média</SelectItem>
                                    <SelectItem value="HIGH" className="text-xs">Alta</SelectItem>
                                    <SelectItem value="URGENT" className="text-xs">Urgente</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <DialogFooter className="pt-3">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            className="text-xs rounded-xl h-9"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={loading}
                            className="bg-[#00bcfe] hover:bg-[#0084cc] text-white text-xs font-semibold rounded-xl h-9 px-4"
                        >
                            Criar Oportunidade
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
