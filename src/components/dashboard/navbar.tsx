"use client";

import { useState, useEffect } from "react";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { SessionSelector } from "@/components/dashboard/session-selector";
import { Button } from "@/components/ui/button";
import { RealtimeClock } from "@/components/dashboard/realtime-clock";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, ChevronRight, Inbox } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { navGroups } from "@/components/dashboard/sidebar-nav";
import { useSession } from "next-auth/react";
import { io } from "socket.io-client";

interface NavbarProps {
    appName?: string;
}

interface Notification {
    id: string;
    title: string;
    message: string;
    type: string;
    read: boolean;
    href?: string;
    createdAt: string;
}

export function Navbar({ appName }: NavbarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const crumb = navGroups.flatMap(g => g.items.map(i => ({ group: g.label, ...i })))
        .filter(i => i.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(i.href))
        .sort((a, b) => b.href.length - a.href.length)[0];
    const { data: session } = useSession();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);

    const fetchNotifications = async () => {
        try {
            const res = await fetch("/api/notifications");
            if (res.ok) {
                const responseData = await res.json();
                const items = responseData?.data || [];
                setNotifications(items);
                setUnreadCount(items.filter((n: Notification) => !n.read).length);
            }
        } catch (e) {
            console.error("Failed to fetch notifications");
        }
    };

    useEffect(() => {
        fetchNotifications();
        if (session?.user?.id) {
            const socketInstance = io({
                path: "/api/socket/io",
            });

            socketInstance.on("connect", () => {
                socketInstance.emit("join-user-room", session.user.id);
            });

            socketInstance.on("notification:new", (notification: Notification) => {
                setNotifications(prev => [notification, ...prev]);
                setUnreadCount(prev => prev + 1);
            });

            return () => {
                socketInstance.disconnect();
            };
        }
    }, [session?.user?.id]);

    const markAsRead = async (id?: string) => {
        try {
            const endpoint = id ? `/api/notifications/read?id=${id}` : "/api/notifications/read-all";
            const res = await fetch(endpoint, { method: "POST" });
            if (res.ok) {
                if (id) {
                    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
                    setUnreadCount(prev => Math.max(0, prev - 1));
                } else {
                    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                    setUnreadCount(0);
                }
            }
        } catch (e) {
            console.error("Failed to mark as read");
        }
    };

    return (
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 h-[64px] flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-0 z-30 w-full">
            <div className="flex items-center gap-3 min-w-0">
                <MobileNav appName={appName} />
                {crumb && (
                    <nav className="hidden md:flex items-center gap-2 text-[13px] min-w-0">
                        {crumb.group !== "Menu" && (
                            <>
                                <span className="text-slate-400 font-medium">{crumb.group}</span>
                                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                            </>
                        )}
                        <span className="font-semibold text-slate-800 truncate">{crumb.label}</span>
                    </nav>
                )}
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                <span className="hidden sm:inline text-xs font-medium text-slate-400"><RealtimeClock /></span>
                <SessionSelector />
                <div className="h-5 w-px bg-slate-200 hidden sm:block" />

                <Popover open={isOpen} onOpenChange={setIsOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative hover:bg-slate-100 rounded-full h-8.5 w-8.5 text-slate-600">
                            <Bell className={`h-4 w-4 transition-colors ${unreadCount > 0 ? 'text-[#00bcfe]' : 'text-slate-500 hover:text-slate-900'}`} />
                            {unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-[#00bcfe] rounded-full animate-ping" />
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 rounded-2xl border border-slate-200 shadow-xl bg-white text-slate-900" align="end">
                        <div className="p-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80">
                            <div>
                                <h4 className="font-bold text-xs text-slate-800">Notificações</h4>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                    {unreadCount > 0 ? `${unreadCount} novas` : "Nenhuma notificação nova"}
                                </p>
                            </div>
                            {unreadCount > 0 && (
                                <Button variant="ghost" size="sm" onClick={() => markAsRead()} className="h-auto py-1 px-2 text-[10px] rounded-full text-[#00bcfe]">
                                    Marcar lidas
                                </Button>
                            )}
                        </div>
                        <div className="max-h-[280px] overflow-y-auto p-2">
                            {notifications.length === 0 ? (
                                <div className="min-h-[120px] flex flex-col items-center justify-center text-center p-4">
                                    <Inbox className="h-6 w-6 text-slate-300 mb-1.5" />
                                    <p className="text-xs text-slate-400 font-medium">Nenhuma notificação</p>
                                </div>
                            ) : (
                                notifications.map(n => (
                                    <div key={n.id} className="p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer">
                                        <div className="text-xs font-semibold text-slate-800">{n.title}</div>
                                        <div className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{n.message}</div>
                                    </div>
                                ))
                            )}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </header>
    );
}
