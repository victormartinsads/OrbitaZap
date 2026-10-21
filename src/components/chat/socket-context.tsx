"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

type SocketContextValue = {
    getSocket: () => Socket | null;
    joinSession: (sessionId: string) => void;
    connected: boolean;
};

const SocketContext = createContext<SocketContextValue>({
    getSocket: () => null,
    joinSession: () => {},
    connected: false,
});

export function useSocket() {
    return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
    const socketRef = useRef<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const activeSessionRef = useRef<string | null>(null);

    useEffect(() => {
        // Conexão persistente de alta performance (Websocket priorizado com fallback)
        const socket = io({
            path: "/api/socket/io",
            addTrailingSlash: false,
            transports: ["websocket", "polling"],
            reconnectionAttempts: 15,
            reconnectionDelay: 1000,
        });

        socket.on("connect", () => {
            setConnected(true);
            // Reassocia à sessão ativa imediatamente se houve reconexão
            if (activeSessionRef.current) {
                socket.emit("join-session", activeSessionRef.current);
            }
        });

        socket.on("disconnect", () => {
            setConnected(false);
        });

        socketRef.current = socket;

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, []);

    const getSocket = useCallback(() => socketRef.current, []);

    const joinSession = useCallback((sessionId: string) => {
        if (!sessionId) return;
        activeSessionRef.current = sessionId;
        const s = socketRef.current;
        if (s?.connected) {
            s.emit("join-session", sessionId);
        }
    }, []);

    return (
        <SocketContext.Provider value={{ getSocket, joinSession, connected }}>
            {children}
        </SocketContext.Provider>
    );
}
