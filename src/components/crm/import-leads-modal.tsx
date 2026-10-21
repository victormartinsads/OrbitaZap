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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";

interface ImportLeadsModalProps {
    isOpen: boolean;
    onClose: () => void;
    pipelineId: string;
    stages: any[];
    onImported: () => void;
}

export function ImportLeadsModal({ isOpen, onClose, pipelineId, stages, onImported }: ImportLeadsModalProps) {
    const [selectedStageId, setSelectedStageId] = useState(stages[0]?.id || "");
    const [tag, setTag] = useState("Importação Lista");
    const [file, setFile] = useState<File | null>(null);
    const [parsedLeads, setParsedLeads] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Parser simples e robusto de CSV no browser (sem dependência externa pesada)
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected) return;

        setFile(selected);
        const reader = new FileReader();

        reader.onload = (event) => {
            const text = event.target?.result as string;
            if (!text) return;

            // Identifica delimitador (, ou ;)
            const firstLine = text.split("\n")[0];
            const delimiter = firstLine.includes(";") ? ";" : ",";

            const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
            if (lines.length < 2) {
                toast.error("O arquivo precisa conter cabeçalho e pelo menos 1 linha de dados.");
                return;
            }

            const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));

            const rows: any[] = [];
            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ""));
                if (values.length === headers.length) {
                    const rowObj: any = {};
                    headers.forEach((h, index) => {
                        rowObj[h] = values[index];
                    });
                    rows.push(rowObj);
                }
            }

            setParsedLeads(rows);
            toast.success(`${rows.length} leads identificados na planilha!`);
        };

        reader.readAsText(selected, "UTF-8");
    };

    const handleImport = async () => {
        if (parsedLeads.length === 0) return toast.error("Selecione um arquivo CSV com dados válidos.");
        if (!selectedStageId) return toast.error("Selecione a etapa de destino.");

        setLoading(true);
        try {
            const res = await fetch("/api/crm/leads/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pipelineId,
                    stageId: selectedStageId,
                    leads: parsedLeads,
                    defaultTag: tag
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(`${data.imported} leads importados com sucesso!`);
                setParsedLeads([]);
                setFile(null);
                onImported();
                onClose();
            } else {
                toast.error(data.error || "Erro ao importar leads.");
            }
        } catch (e) {
            toast.error("Erro de conexão ao processar importação.");
        } finally {
            setLoading(false);
        }
    };

    const downloadTemplate = () => {
        const csvContent = "data:text/csv;charset=utf-8," + "Nome,Telefone,Email,Empresa,Valor\nJoão Silva,5511999998888,joao@empresa.com,Empresa X,1500\nMaria Santos,5521988887777,maria@loja.com,Loja Y,3000";
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "modelo_leads_orbita.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg bg-white rounded-2xl border-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-slate-900">
                        Importar Leads em Massa (CSV)
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-500">
                        Suba uma planilha com seus contatos para povoar o funil automaticamente.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Botão de Exemplo / Template */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                        <div className="flex items-center gap-2">
                            <FileSpreadsheet size={16} className="text-[#00bcfe]" />
                            <span className="text-xs text-slate-700 font-medium">Baixar modelo de exemplo</span>
                        </div>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={downloadTemplate}
                            className="text-xs text-[#00bcfe] hover:text-[#0084cc] hover:bg-[#e0f2fe] h-7 gap-1"
                        >
                            <Download size={12} />
                            Baixar .CSV
                        </Button>
                    </div>

                    {/* Seleção de Etapa e Tag */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-700">Etapa de Entrada *</Label>
                            <Select
                                value={selectedStageId || stages[0]?.id}
                                onValueChange={(val) => setSelectedStageId(val)}
                            >
                                <SelectTrigger className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200">
                                    <SelectValue placeholder="Selecione" />
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
                            <Label className="text-xs font-semibold text-slate-700">Etiqueta Padrão</Label>
                            <Input
                                value={tag}
                                onChange={(e) => setTag(e.target.value)}
                                className="h-9 text-xs rounded-xl bg-slate-50 border-slate-200"
                            />
                        </div>
                    </div>

                    {/* Área de Upload */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-slate-700">Arquivo CSV / Planilha</Label>
                        <div className="border-2 border-dashed border-slate-200 hover:border-[#00bcfe] rounded-2xl p-6 text-center bg-slate-50/50 cursor-pointer transition-colors relative">
                            <input
                                type="file"
                                accept=".csv,text/csv"
                                onChange={handleFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                            <div className="flex flex-col items-center justify-center gap-1.5">
                                <Upload size={22} className="text-[#00bcfe]" />
                                <p className="text-xs font-semibold text-slate-800">
                                    {file ? file.name : "Clique ou arraste seu arquivo .CSV aqui"}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                    Colunas suportadas: Nome, Telefone, Email, Empresa, Valor
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Feedback da quantidade lida */}
                    {parsedLeads.length > 0 && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#e0f2fe] text-[#0084cc] text-xs font-semibold">
                            <CheckCircle2 size={15} />
                            <span>{parsedLeads.length} leads prontos para serem inseridos no funil.</span>
                        </div>
                    )}
                </div>

                <DialogFooter className="pt-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        className="text-xs rounded-xl h-9"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        disabled={loading || parsedLeads.length === 0}
                        onClick={handleImport}
                        className="bg-[#00bcfe] hover:bg-[#0084cc] text-white text-xs font-semibold rounded-xl h-9 px-4"
                    >
                        {loading ? "Importando..." : `Importar ${parsedLeads.length || ""} Leads`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
