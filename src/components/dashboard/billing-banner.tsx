import Link from "next/link";
import { AlertTriangle, Clock, Lock } from "lucide-react";
import type { BillingReason } from "@/lib/billing/access";

interface BillingBannerProps {
    reason: BillingReason;
    daysLeft: number | null;
    deadline: Date | null;
}

const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function BillingBanner({ reason, daysLeft, deadline }: BillingBannerProps) {
    let tone: "info" | "warn" | "danger";
    let icon = <Clock size={15} />;
    let text: string;

    switch (reason) {
        case "trial":
            if (daysLeft === null || daysLeft > 3) return null;
            tone = "info";
            text = daysLeft <= 1 ? "Seu teste grátis termina hoje." : `Seu teste grátis termina em ${daysLeft} dias.`;
            break;
        case "grace":
            tone = "warn";
            icon = <AlertTriangle size={15} />;
            text = `Pagamento em atraso. Regularize até ${deadline ? fmt(deadline) : "logo"} para não perder o acesso.`;
            break;
        case "canceled":
            if (daysLeft === null || daysLeft > 7) return null;
            tone = "info";
            text = `Sua assinatura foi cancelada e fica ativa até ${deadline ? fmt(deadline) : "o fim do período"}.`;
            break;
        case "trial_expired":
        case "past_due":
        case "expired":
        case "no_subscription":
            tone = "danger";
            icon = <Lock size={15} />;
            text = reason === "trial_expired"
                ? "Seu teste grátis terminou. Escolha um plano para continuar usando."
                : "Sua assinatura não está ativa. Escolha um plano para reativar seus WhatsApps.";
            break;
        default:
            return null;
    }

    const styles = {
        info: "bg-sky-50 text-sky-900 border-sky-200",
        warn: "bg-amber-50 text-amber-900 border-amber-200",
        danger: "bg-rose-50 text-rose-900 border-rose-200",
    }[tone];

    return (
        <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs font-medium ${styles}`}>
            <span className="flex items-center gap-1.5">{icon}{text}</span>
            <Link href="/dashboard/billing" className="underline underline-offset-2 font-semibold hover:opacity-80">
                {tone === "info" && reason === "trial" ? "Ver planos" : "Resolver agora"}
            </Link>
        </div>
    );
}
