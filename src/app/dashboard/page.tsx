import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
    Plus,
    Wifi,
    MessageSquare,
    ArrowUpRight,
    Activity,
    Zap,
    Send,
    Users,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { getAccessibleSessions } from "@/lib/api-auth";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const session = await auth();
    if (!session?.user) {
        redirect("/login");
    }

    const sessions = await getAccessibleSessions(session.user.id!, session.user.role || "OWNER");

    const totalSessions = sessions.length;
    const connectedSessions = sessions.filter(s => s.status === 'CONNECTED').length;

    let autoReplyCount = 0;
    try {
        const sessionIds = sessions.map(s => s.sessionId);
        if (sessionIds.length > 0) {
            autoReplyCount = await prisma.autoReply.count({
                where: { sessionId: { in: sessionIds } }
            });
        }
    } catch {
        // Fallback
    }

    let totalMessages = 0;
    try {
        const sessionIds = sessions.map(s => s.id);
        if (sessionIds.length > 0) {
            totalMessages = await prisma.message.count({
                where: { sessionId: { in: sessionIds } }
            });
        }
    } catch {
        // Fallback
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
            {/* Header Limpo */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        Visão Geral
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Acompanhe o status das suas conexões e atalhos rápidos.
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    <Link href="/dashboard/chat">
                        <Button className="rounded-full shadow-xs">
                            <MessageSquare size={14} /> Abrir Conversas
                        </Button>
                    </Link>
                    <Link href="/dashboard/sessions">
                        <Button variant="outline" className="rounded-full">
                            <Plus size={14} /> Nova Conexão
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Cards de Métricas em Branco com Bordas Finas */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs hover:border-[#00bcfe]/40 transition-colors">
                    <div className="flex items-center justify-between text-slate-500">
                        <span className="text-xs font-medium">WhatsApp Conectado</span>
                        <div className={`h-2.5 w-2.5 rounded-full ${connectedSessions > 0 ? "bg-[#00bcfe]" : "bg-red-500"}`} />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                        {connectedSessions} <span className="text-xs font-normal text-slate-400">/ {totalSessions}</span>
                    </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs hover:border-[#00bcfe]/40 transition-colors">
                    <div className="flex items-center justify-between text-slate-500">
                        <span className="text-xs font-medium">Status do Sistema</span>
                        <Wifi size={14} className={connectedSessions > 0 ? "text-[#00bcfe]" : "text-slate-400"} />
                    </div>
                    <div className="mt-2 text-base font-bold text-slate-900">
                        {connectedSessions > 0 ? "Operacional" : "Offline"}
                    </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs hover:border-[#00bcfe]/40 transition-colors">
                    <div className="flex items-center justify-between text-slate-500">
                        <span className="text-xs font-medium">Mensagens</span>
                        <Activity size={14} className="text-slate-400" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                        {totalMessages.toLocaleString('pt-BR')}
                    </div>
                </div>

                <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs hover:border-[#00bcfe]/40 transition-colors">
                    <div className="flex items-center justify-between text-slate-500">
                        <span className="text-xs font-medium">Respostas Automáticas</span>
                        <Zap size={14} className="text-slate-400" />
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                        {autoReplyCount}
                    </div>
                </div>
            </div>

            {/* Sessões e Atalhos em Branco e Cinza Claro */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Active Sessions List */}
                <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                        <h2 className="text-sm font-bold text-slate-900">Sessões WhatsApp</h2>
                        <Link href="/dashboard/sessions" className="text-xs font-semibold text-[#00bcfe] hover:underline inline-flex items-center gap-1">
                            Gerenciar <ArrowUpRight size={13} />
                        </Link>
                    </div>

                    <div className="space-y-2">
                        {sessions.length === 0 ? (
                            <div className="text-center py-8 text-xs text-slate-400">
                                Nenhuma sessão conectada no momento.
                            </div>
                        ) : (
                            sessions.map((s) => (
                                <div
                                    key={s.id}
                                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/60 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2.5 h-2.5 rounded-full ${s.status === "CONNECTED" ? "bg-[#00bcfe]" : "bg-red-500"}`} />
                                        <div>
                                            <div className="font-semibold text-xs text-slate-900">{s.name}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">{s.sessionId}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                                            s.status === "CONNECTED"
                                                ? "bg-[#00bcfe]/12 text-[#0084cc]"
                                                : "bg-red-50 text-red-600"
                                        }`}>
                                            {s.status === "CONNECTED" ? "Conectado" : s.status}
                                        </span>
                                        <Link href="/dashboard/chat">
                                            <Button size="sm" variant="ghost" className="h-7 text-xs rounded-full px-2.5 text-slate-600">
                                                Abrir
                                            </Button>
                                        </Link>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Minimal Shortcut Actions */}
                <div className="rounded-2xl bg-white border border-slate-200/80 p-5 shadow-xs">
                    <h2 className="text-sm font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100">
                        Navegação Direta
                    </h2>
                    <div className="space-y-1.5">
                        <Link href="/dashboard/flows" className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-xs text-slate-800 transition-colors">
                            <span className="flex items-center gap-2.5 font-medium">
                                <Zap size={14} className="text-[#00bcfe]" /> Fluxos Automáticos
                            </span>
                            <ArrowUpRight size={13} className="text-slate-400" />
                        </Link>

                        <Link href="/dashboard/broadcast" className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-xs text-slate-800 transition-colors">
                            <span className="flex items-center gap-2.5 font-medium">
                                <Send size={14} className="text-[#00bcfe]" /> Campanhas e Transmissão
                            </span>
                            <ArrowUpRight size={13} className="text-slate-400" />
                        </Link>

                        <Link href="/dashboard/contacts" className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-xs text-slate-800 transition-colors">
                            <span className="flex items-center gap-2.5 font-medium">
                                <Users size={14} className="text-[#00bcfe]" /> Contatos e Grupos
                            </span>
                            <ArrowUpRight size={13} className="text-slate-400" />
                        </Link>

                        <Link href="/dashboard/archive" className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 text-xs text-slate-800 transition-colors">
                            <span className="flex items-center gap-2.5 font-medium">
                                <MessageSquare size={14} className="text-[#00bcfe]" /> Exportação de Histórico
                            </span>
                            <ArrowUpRight size={13} className="text-slate-400" />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
