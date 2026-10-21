"use client";

import { ChatLayoutClient } from "./chat-layout-client";

interface ChatInterfaceProps {
    sessionId: string | null;
}

export function ChatInterface({ sessionId }: ChatInterfaceProps) {
    if (!sessionId) {
        return (
            <div className="flex h-full items-center justify-center p-8 text-center text-[#8e95a5]">
                Nenhuma sessão do WhatsApp selecionada. Selecione uma sessão na barra superior.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] gap-4">
            <div className="flex-1 rounded-[2.5rem] border border-[#f3f1ec]/[0.08] overflow-hidden bg-[#11131a] shadow-xl">
                <ChatLayoutClient key={sessionId} sessionId={sessionId} />
            </div>
        </div>
    );
}
