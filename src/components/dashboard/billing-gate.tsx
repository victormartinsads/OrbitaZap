"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Leva para /dashboard/billing quem está sem assinatura ativa. É só a camada de interface:
 * o bloqueio real está nas rotas da API (402).
 */
export function BillingGate({ initialActive, children }: { initialActive: boolean; children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [active, setActive] = useState(initialActive);
    const onBillingPage = pathname.startsWith("/dashboard/billing");

    useEffect(() => {
        let cancelled = false;
        fetch("/api/billing", { cache: "no-store" })
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (!cancelled && data) setActive(data.isActive);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [pathname]);

    useEffect(() => {
        if (!active && !onBillingPage) router.replace("/dashboard/billing");
    }, [active, onBillingPage, router]);

    if (!active && !onBillingPage) return null;
    return <>{children}</>;
}
