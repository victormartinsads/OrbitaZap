"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "./session-provider";

export function SessionSelector() {
    const { sessions, sessionId, setSessionId, loading } = useSession();
    const selectedSession = sessions.find(s => s.sessionId === sessionId);

    return (
        <div className="flex items-center gap-1 sm:gap-2">
            <div className="w-[150px] sm:w-[180px]">
                <Select value={sessionId} onValueChange={setSessionId} disabled={loading || sessions.length === 0}>
                    <SelectTrigger className="h-8.5 border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 transition-all rounded-full px-3 shadow-2xs focus:ring-1 focus:ring-[#00bcfe]/40 text-xs">
                        <SelectValue placeholder={loading ? "Carregando..." : "Selecionar sessão"}>
                            {selectedSession ? (
                                <div className="flex items-center gap-2 text-left">
                                    <span className="relative flex h-2 w-2">
                                        {selectedSession.status === "CONNECTED" && (
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00bcfe] opacity-75"></span>
                                        )}
                                        <span className={`relative inline-flex rounded-full h-2 w-2 ${selectedSession.status === "CONNECTED" ? "bg-[#00bcfe]" : "bg-red-500"}`}></span>
                                    </span>
                                    <span className="truncate font-semibold text-xs text-slate-800">{selectedSession.name}</span>
                                </div>
                            ) : null}
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border border-slate-200 shadow-xl p-1 bg-white text-slate-900">
                        {sessions.map((s) => (
                            <SelectItem key={s.sessionId} value={s.sessionId} className="rounded-lg py-1.5 px-2.5 focus:bg-slate-50 cursor-pointer">
                                <div className="flex items-center gap-2">
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${s.status === "CONNECTED" ? "bg-[#00bcfe]" : "bg-red-500"}`}></span>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-xs text-slate-800">{s.name}</span>
                                        <span className="text-[10px] text-slate-400 font-mono">{s.sessionId}</span>
                                    </div>
                                </div>
                            </SelectItem>
                        ))}
                        {sessions.length === 0 && !loading && (
                            <div className="py-3 px-2 text-xs text-slate-400 text-center">
                                Nenhuma sessão encontrada.
                            </div>
                        )}
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
