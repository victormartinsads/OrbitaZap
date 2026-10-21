"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getCookie, setCookie } from "@/lib/client-cookie";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Session {
    id: string;
    sessionId: string;
    name: string;
    status: string;
}

interface SessionContextType {
    sessions: Session[];
    sessionId: string;
    setSessionId: (id: string) => void;
    refreshSessions: () => Promise<void>;
    loading: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [sessionId, setSessionIdState] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/sessions');
            if (res.ok) {
                const responseData = await res.json();
                const data: Session[] = responseData?.data || [];
                setSessions(data);

                // Prioritize connected sessions
                const connected = data.filter((s: Session) => s.status === "CONNECTED");
                const targetPool = connected.length > 0 ? connected : data;

                // Sync with cookie or auto-select
                const cookieId = getCookie("sessionId");
                if (cookieId && data.find((s: Session) => s.sessionId === cookieId)) {
                    setSessionIdState(cookieId);
                } else if (targetPool.length > 0) {
                    const chosen = targetPool[0].sessionId;
                    setSessionIdState(chosen);
                    setCookie("sessionId", chosen);
                } else {
                    setSessionIdState("");
                }
            }
        } catch (error) {
            console.error(error);
            toast.error("Falha ao buscar as sessões");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const setSessionId = (id: string) => {
        setSessionIdState(id);
        setCookie("sessionId", id); // Sync Cookie
        router.refresh(); // Sync Server Components
    };

    return (
        <SessionContext.Provider value={{ sessions, sessionId, setSessionId, refreshSessions: fetchSessions, loading }}>
            {children}
        </SessionContext.Provider>
    );
}

export function useSession() {
    const context = useContext(SessionContext);
    if (!context) {
        throw new Error("useSession must be used within a SessionProvider");
    }
    return context;
}
