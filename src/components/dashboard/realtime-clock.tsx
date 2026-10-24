"use client";

import { useEffect, useState } from "react";
import moment from "moment-timezone";
import { Clock } from "lucide-react";

export function RealtimeClock() {
    const [time, setTime] = useState("");
    const [timezone, setTimezone] = useState("America/Sao_Paulo");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Fetch global timezone
        fetch('/api/settings/system')
            .then(r => r.json())
            .then(data => {
                if (data && data.data && data.data.timezone) {
                    setTimezone(data.data.timezone);
                }
            })
            .catch(() => { });
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const updateTime = () => {
            setTime(moment().tz(timezone).format("HH:mm:ss"));
        };

        updateTime();
        const interval = setInterval(updateTime, 1000);
        return () => clearInterval(interval);
    }, [timezone, mounted]);

    if (!mounted) return null;

    return (
        <div className="flex h-11 items-center gap-3 rounded-xl border border-border/70 bg-background px-4 text-sm font-medium text-foreground shadow-sm">
            <Clock className="h-4 w-4 text-foreground/80" />
            <span className="tabular-nums">{time}</span>
            <span className="h-5 w-px bg-border" />
            <span className="text-[13px] font-normal text-muted-foreground">{timezone}</span>
        </div>
    );
}
