"use client";

import { useEffect, useState } from "react";
import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";
import { ArrowRight, Braces, Eye, EyeOff, Info, Lock, User } from "lucide-react";
import { OrbitaZapLogo } from "@/components/brand/marcflow-logo";

// The hint box only ever shows the public defaults: custom credentials are never displayed
const USING_DEFAULT_CREDENTIALS = (process.env.NEXT_PUBLIC_SWAGGER_USERNAME || "admin") === "admin"
    && (process.env.NEXT_PUBLIC_SWAGGER_PASSWORD || "admin123") === "admin123";

export default function ApiDocsPage() {
    const [authorized, setAuthorized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        // Suppress Swagger UI legacy lifecycle warnings (ModelCollapse)
        const originalWarn = console.warn;
        console.warn = (...args) => {
            if (typeof args[0] === 'string' &&
                args[0].includes('UNSAFE_componentWillReceiveProps') &&
                args[0].includes('ModelCollapse')) {
                return;
            }
            originalWarn(...args);
        };

        // Check if already authorized via session storage
        const isAuth = sessionStorage.getItem("swagger_auth") === "true";
        if (isAuth) {
            setAuthorized(true);
        }
        setLoading(false);

        return () => {
            console.warn = originalWarn;
        };
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();

        // Basic auth - compare with env variables or hardcoded (for demo)
        const validUsername = process.env.NEXT_PUBLIC_SWAGGER_USERNAME || "admin";
        const validPassword = process.env.NEXT_PUBLIC_SWAGGER_PASSWORD || "admin123";

        if (username === validUsername && password === validPassword) {
            sessionStorage.setItem("swagger_auth", "true");
            setAuthorized(true);
            setError("");
        } else {
            setError("Credenciais inválidas");
        }
    };

    const handleLogout = () => {
        sessionStorage.removeItem("swagger_auth");
        setAuthorized(false);
        setUsername("");
        setPassword("");
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-gray-600">Carregando...</div>
            </div>
        );
    }

    if (!authorized) {
        return (
            <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0B111C] text-slate-100">
                {/* subtle grid */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:64px_64px]" />
                <div aria-hidden className="pointer-events-none absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />

                <main className="relative mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 px-4 py-10 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
                    <section className="space-y-8">
                        <div className="flex items-center gap-3">
                            <OrbitaZapLogo className="h-11 w-11" />
                            <span className="text-2xl font-semibold tracking-tight sm:text-3xl">OrbitaZap</span>
                            <span className="rounded-md border border-blue-500/70 px-2 py-0.5 text-sm font-medium text-blue-400">API</span>
                        </div>
                        <div className="space-y-4">
                            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl">
                                Suas integrações.<br />Novas possibilidades.
                            </h1>
                            <p className="max-w-xl text-base text-slate-400 sm:text-lg">Acesse a documentação e conecte suas aplicações ao OrbitaZap.</p>
                        </div>
                        <div className="hidden max-w-xl overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/60 shadow-2xl sm:block">
                            <div className="flex items-center justify-between border-b border-slate-700/60 px-4 py-3">
                                <div className="flex gap-2">
                                    <span className="h-3 w-3 rounded-full bg-[#FF5F57]" /><span className="h-3 w-3 rounded-full bg-[#FEBC2E]" /><span className="h-3 w-3 rounded-full bg-[#28C840]" />
                                </div>
                                <span className="text-xs font-medium text-slate-400">API REST</span>
                            </div>
                            <div className="relative px-4 py-4 font-mono text-[13px] leading-7">
                                <span className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg border border-blue-500/60 text-blue-400"><Braces className="h-5 w-5" /></span>
                                {[
                                    <><span className="text-blue-400">GET</span>  /api/v1</>,
                                    <>{"{"}</>,
                                    <>  <span className="text-emerald-300">&quot;data&quot;</span>: {"{"}</>,
                                    <>    <span className="text-emerald-300">&quot;message&quot;</span>: <span className="text-amber-200">&quot;Integrações que impulsionam seu negócio.&quot;</span></>,
                                    <>  {"}"}</>,
                                    <>{"}"}</>,
                                ].map((line, i) => (
                                    <div key={i} className="flex gap-4 whitespace-pre-wrap pr-14">
                                        <span className="w-4 shrink-0 select-none text-right text-slate-600">{i + 1}</span>
                                        <span className="text-slate-200">{line}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="w-full rounded-2xl border border-slate-700/60 bg-slate-900/70 p-6 shadow-2xl backdrop-blur sm:p-10">
                        <div className="mb-8 text-center">
                            <h2 className="text-2xl font-bold sm:text-3xl">Documentação da API</h2>
                            <p className="mt-2 text-sm text-slate-400 sm:text-base">Entre com suas credenciais para continuar.</p>
                        </div>
                        <form onSubmit={handleLogin} className="space-y-5">
                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-200">Usuário</span>
                                <span className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/40 px-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
                                    <User className="h-5 w-5 shrink-0 text-slate-400" />
                                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required
                                        className="h-12 w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-500" placeholder="Digite seu usuário" />
                                </span>
                            </label>
                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-200">Senha</span>
                                <span className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/40 px-4 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30">
                                    <Lock className="h-5 w-5 shrink-0 text-slate-400" />
                                    <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required
                                        className="h-12 w-full bg-transparent text-slate-100 outline-none placeholder:text-slate-500" placeholder="Digite sua senha" />
                                    <button type="button" onClick={() => setShowPassword(v => !v)} className="shrink-0 text-slate-400 hover:text-slate-200" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </span>
                            </label>

                            {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

                            <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 font-medium text-white transition-colors hover:bg-blue-500">
                                Acessar documentação <ArrowRight className="h-4 w-4" />
                            </button>
                        </form>

                        {USING_DEFAULT_CREDENTIALS && (
                            <div className="mt-6 flex gap-4 rounded-xl border border-blue-500/50 bg-blue-500/10 p-5">
                                <Info className="mt-0.5 h-6 w-6 shrink-0 text-blue-400" />
                                <div className="space-y-2">
                                    <p className="font-semibold">Credenciais de acesso</p>
                                    <p className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-slate-300">
                                        <span>Usuário:</span><code className="font-semibold text-blue-300">admin</code>
                                        <span>Senha:</span><code className="font-semibold text-blue-300">admin123</code>
                                    </p>
                                </div>
                            </div>
                        )}
                    </section>
                </main>

                <footer className="relative mx-auto w-full max-w-7xl px-4 pb-8 text-sm text-slate-500 sm:px-8">
                    Desenvolvido por Marcos Maia · <a href="https://instagram.com/marcolamaia" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300">@marcolamaia</a>
                </footer>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 shadow-lg">
                <div className="container mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold">Documentação da API do OrbitaZap</h1>
                        <p className="text-blue-100 text-sm mt-1">
                            Documentação interativa da API · criado por Marcos Maia (@marcolamaia)
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                    >
                        Sair
                    </button>
                </div>
            </div>

            <div className="container mx-auto">
                <SwaggerUI url="/api/docs" />
            </div>
        </div>
    );
}
