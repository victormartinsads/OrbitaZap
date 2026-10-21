"use client";

import { useEffect } from "react";

export function UpdateChecker() {
    useEffect(() => {
        const checkUpdates = async () => {
            // Evitar chamadas redundantes: checar no máximo uma vez a cada 1 hora por navegador
            const lastCheck = localStorage.getItem("marcflow_last_update_check");
            const now = Date.now();
            if (lastCheck && now - parseInt(lastCheck, 10) < 3600000) {
                return;
            }

            try {
                const res = await fetch('/api/system/check-updates', { method: 'POST' });
                localStorage.setItem("marcflow_last_update_check", now.toString());
            } catch (error) {
                // Silently ignore offline or failed checks
            }
        };

        checkUpdates();
    }, []);

    return null;
}
