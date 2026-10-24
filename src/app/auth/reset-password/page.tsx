'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function ResetPasswordForm() {
    const router = useRouter();
    const token = useSearchParams().get('token') ?? '';
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres');
        if (password !== confirm) return setError('As senhas não coincidem');

        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/account/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Não foi possível alterar a senha');
            router.push('/auth/login?reset=1');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado');
            setLoading(false);
        }
    }

    const inputClass = "h-12 px-4 rounded-xl bg-background/50 font-medium";

    return (
        <div className="flex items-center justify-center min-h-screen relative overflow-hidden bg-background">
            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 w-[30rem] h-[30rem] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10 w-full max-w-md p-4 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex flex-col items-center mb-8">
                    <div className="relative flex h-16 w-16 mb-4 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-primary text-white shadow-lg shadow-primary/30">
                        <KeyRound className="h-8 w-8" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Criar nova senha</h1>
                    <p className="text-muted-foreground mt-2">Escolha uma senha com pelo menos 8 caracteres.</p>
                </div>

                <div className="glass-panel rounded-3xl p-8 shadow-2xl shadow-black/5">
                    {!token ? (
                        <p className="text-sm text-center text-muted-foreground">
                            Link incompleto. <Link href="/auth/forgot-password" className="font-semibold text-primary">Peça um novo link</Link>.
                        </p>
                    ) : (
                        <form onSubmit={onSubmit} className="space-y-5">
                            {error && (
                                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center font-medium">
                                    {error}
                                    {error.includes('expirou') && (
                                        <> <Link href="/auth/forgot-password" className="underline">Pedir novo link</Link></>
                                    )}
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-foreground/80">Nova senha</Label>
                                <Input id="password" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirm" className="text-foreground/80">Confirmar senha</Label>
                                <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" className={inputClass} />
                            </div>
                            <Button type="submit" size="lg" className="w-full h-12 rounded-xl text-base" disabled={loading}>
                                {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Salvando...</> : 'Salvar nova senha'}
                            </Button>
                        </form>
                    )}
                </div>

                <div className="mt-8 text-center text-sm">
                    <Link href="/auth/login" className="inline-flex items-center gap-1.5 font-semibold text-primary hover:text-primary/80">
                        <ArrowLeft className="h-4 w-4" /> Voltar para o login
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <ResetPasswordForm />
        </Suspense>
    );
}
