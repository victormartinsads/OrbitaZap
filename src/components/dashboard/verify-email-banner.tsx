"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MailWarning } from "lucide-react";

export function VerifyEmailBanner({ email }: { email: string }) {
    const [sending, setSending] = useState(false);

    const resend = async () => {
        setSending(true);
        try {
            const res = await fetch("/api/account/resend-verification", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Não foi possível reenviar");
            if (data.alreadyVerified) {
                toast.success("Seu e-mail já está confirmado.");
                window.location.reload();
                return;
            }
            toast.success(`Enviamos um novo link para ${data.email}.`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro ao reenviar");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-violet-200 bg-violet-50 px-4 py-2 text-xs font-medium text-violet-900">
            <span className="flex items-center gap-1.5">
                <MailWarning size={15} />
                Confirme seu e-mail ({email}) para conectar WhatsApps e assinar.
            </span>
            <button
                onClick={resend}
                disabled={sending}
                className="underline underline-offset-2 font-semibold hover:opacity-80 disabled:opacity-50"
            >
                {sending ? "Enviando..." : "Reenviar e-mail"}
            </button>
        </div>
    );
}
