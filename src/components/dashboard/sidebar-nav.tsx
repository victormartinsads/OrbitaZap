"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
    LayoutDashboard,
    MessageSquare,
    Users,
    Settings,
    QrCode,
    ImageIcon,
    Webhook,
    CalendarClock,
    Bot,
    UserCheck,
    Megaphone,
    Activity,
    Tag,
    MessageCircleReply,
    UserPlus,
    DatabaseBackup,
    Workflow,
    Kanban
} from "lucide-react";
import { useSidebar } from "./sidebar-context";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface NavGroup {
    label: string;
    items: NavItem[];
}

interface NavItem {
    href: string;
    label: string;
    icon: React.ElementType;
    external?: boolean;
    superadminOnly?: boolean;
    allowedRoles?: string[];
}

export const navGroups: NavGroup[] = [
    {
        label: "Menu",
        items: [
            { href: "/dashboard", label: "Visão Geral", icon: LayoutDashboard },
            { href: "/dashboard/crm", label: "CRM & Funis", icon: Kanban },
            { href: "/dashboard/chat", label: "Conversas", icon: MessageSquare },
            { href: "/dashboard/flows", label: "Fluxos", icon: Workflow },
            { href: "/dashboard/contacts", label: "Contatos", icon: UserCheck },
            { href: "/dashboard/groups", label: "Grupos", icon: Users },
            { href: "/dashboard/broadcast", label: "Transmissão", icon: Megaphone },
        ],
    },
    {
        label: "Automação",
        items: [
            { href: "/dashboard/quick-replies", label: "Respostas Rápidas", icon: MessageCircleReply },
            { href: "/dashboard/autoreply", label: "Auto Resposta", icon: Bot },
            { href: "/dashboard/scheduler", label: "Agendamentos", icon: CalendarClock },
            { href: "/dashboard/labels", label: "Etiquetas", icon: Tag },
        ],
    },
    {
        label: "Sistema",
        items: [
            { href: "/dashboard/settings", label: "Configurações", icon: Settings },
        ],
    },
];

export function SidebarNav() {
    const pathname = usePathname();
    const { isCollapsed } = useSidebar();
    const { data: session } = useSession();
    const userRole = session?.user?.role;

    const isActive = (href: string) => {
        if (href === "/dashboard") return pathname === "/dashboard";
        return pathname.startsWith(href);
    };

    return (
        <TooltipProvider delayDuration={0}>
            <nav className="flex-1 px-2.5 pb-2 overflow-y-auto overflow-x-hidden space-y-3 sidebar-scrollbar">
                {navGroups.map((group) => {
                    const visibleItems = group.items.filter((item) => {
                        if (item.superadminOnly && userRole !== "SUPERADMIN") return false;
                        if (item.allowedRoles && (!userRole || !item.allowedRoles.includes(userRole))) return false;
                        return true;
                    });
                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={group.label} className="space-y-0.5">
                            {!isCollapsed && (
                                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</p>
                            )}

                            {isCollapsed && (
                                <div className="mx-2 my-1.5 border-t border-slate-200" />
                            )}

                            {visibleItems.map((item) => (
                                <NavLink
                                    key={item.href}
                                    item={item}
                                    active={isActive(item.href)}
                                    isCollapsed={isCollapsed}
                                />
                            ))}
                        </div>
                    );
                })}
            </nav>
        </TooltipProvider>
    );
}

function NavLink({ item, active, isCollapsed }: { item: NavItem; active: boolean; isCollapsed: boolean }) {
    const Icon = item.icon;

    const linkContent = (
        <Link
            href={item.href}
            target={item.external ? "_blank" : undefined}
            className={`
                flex items-center rounded-xl text-[13px] font-medium
                transition-all duration-150 group relative
                ${isCollapsed ? "justify-center p-2" : "gap-2.5 px-3 py-1.5"}
                ${active
                    ? "bg-[#00bcfe]/12 text-[#0084cc] font-semibold"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }
            `}
        >
            <Icon
                size={16}
                strokeWidth={active ? 2.2 : 1.8}
                className={`flex-shrink-0 transition-colors ${active ? "text-[#00bcfe]" : "text-slate-400 group-hover:text-slate-700"}`}
            />
            {!isCollapsed && <span className="truncate">{item.label}</span>}
        </Link>
    );

    if (isCollapsed) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>
                    {linkContent}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10} className="bg-white border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1 text-xs font-semibold shadow-md">
                    {item.label}
                </TooltipContent>
            </Tooltip>
        );
    }

    return linkContent;
}
