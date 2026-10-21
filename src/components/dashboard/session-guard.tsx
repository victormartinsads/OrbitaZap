"use client";

import { useSession } from "./session-provider";
import { Bot, QrCode } from "lucide-react";
import { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function SessionGuard({ children }: { children: ReactNode }) {
    const { sessionId, loading, sessions, setSessionId } = useSession();

    if (loading) {
        return <div className="flex h-full items-center justify-center p-8">Carregando sessão...</div>;
    }

    if (!sessionId) {
        return (
            <div className="flex h-full flex-col items-center justify-center space-y-6 text-center p-8">
                <div className="rounded-full bg-green-100 p-6">
                    <QrCode className="h-12 w-12 text-green-600" />
                </div>
                <div className="space-y-2 max-w-md">
                    <h2 className="text-2xl font-bold tracking-tight">Nenhuma sessão ativa selecionada</h2>
                    <p className="text-gray-500">
                        {sessions.length > 0 
                            ? "Clique abaixo na sessão conectada para ativá-la:"
                            : "Selecione uma sessão do WhatsApp na barra de navegação superior para acessar este recurso."
                        }
                    </p>
                </div>

                {sessions.length > 0 ? (
                    <div className="flex flex-col gap-3 w-full max-w-sm">
                        {sessions.map((s) => (
                            <Button 
                                key={s.sessionId}
                                variant="outline"
                                className="flex items-center justify-between p-4 h-auto hover:border-primary"
                                onClick={() => setSessionId(s.sessionId)}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-2.5 w-2.5">
                                        {s.status === "CONNECTED" && (
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        )}
                                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${s.status === "CONNECTED" ? "bg-emerald-500" : "bg-destructive"}`}></span>
                                    </span>
                                    <div className="text-left">
                                        <div className="font-semibold">{s.name}</div>
                                        <div className="text-xs text-muted-foreground font-mono">{s.sessionId} ({s.status})</div>
                                    </div>
                                </div>
                                <span className="text-xs font-medium text-primary">Ativar sessão &rarr;</span>
                            </Button>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-gray-500">Você ainda não tem nenhuma sessão.</p>
                        <Link href="/dashboard/sessions">
                            <Button variant="outline">Criar uma sessão</Button>
                        </Link>
                    </div>
                )}
            </div>
        );
    }

    return <>{children}</>;
}
