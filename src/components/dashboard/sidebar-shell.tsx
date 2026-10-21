"use client";

import Link from "next/link";
import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "./sidebar-context";
import { LogOut, PanelLeftClose, PanelLeft, Settings } from "lucide-react";
import { signOut } from "next-auth/react";
import { MarcFlowLogo } from "@/components/brand/marcflow-logo";

interface SidebarShellProps {
    appName: string;
    userName?: string | null;
    userEmail?: string | null;
    version: string;
}

export function SidebarShell({ appName, userName, userEmail }: SidebarShellProps) {
    const { isCollapsed, toggleCollapse } = useSidebar();
    const initial = userName?.charAt(0)?.toUpperCase() || "A";

    return (
        <aside
            className={`
                hidden md:flex flex-col h-full sticky left-0 top-0 z-20
                bg-white text-slate-800 border-r border-slate-200
                transition-all duration-300 ease-in-out
                ${isCollapsed ? "w-[72px]" : "w-[240px]"}
            `}
        >
            {/* Header Brand */}
            <div className={`flex items-center transition-all duration-300 ${isCollapsed ? "justify-center p-4" : "justify-between px-5 py-5"}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                    <MarcFlowLogo className="h-8 w-8 shrink-0" />
                    {!isCollapsed && (
                        <div className="min-w-0">
                            <span className="text-[15px] font-bold tracking-tight text-slate-900 block">
                                {appName}
                            </span>
                        </div>
                    )}
                </div>
                {!isCollapsed && (
                    <button
                        onClick={toggleCollapse}
                        title="Recolher menu"
                        className="rounded-lg p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                        <PanelLeftClose size={15} />
                    </button>
                )}
            </div>

            {/* Navigation links */}
            <SidebarNav />

            {/* Clean Profile Section */}
            <div className="p-3 border-t border-slate-200">
                {isCollapsed ? (
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={toggleCollapse}
                            title="Expandir menu"
                            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 mb-1"
                        >
                            <PanelLeft size={16} />
                        </button>
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-[#00bcfe]">
                            {initial}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-[#00bcfe] shrink-0 shadow-2xs">
                                {initial}
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{userName || "Admin"}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-0.5">
                            <Link href="/dashboard/settings" title="Configurações" className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/50">
                                <Settings size={14} />
                            </Link>
                            <button onClick={() => signOut({ callbackUrl: "/auth/login" })} title="Sair" className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50">
                                <LogOut size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}
