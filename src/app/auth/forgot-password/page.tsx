'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Mail, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/account/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Não foi possível enviar o link');
            setSent(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen relative overflow-hidden bg-background">
            <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 w-[30rem] h-[30rem] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10 w-full max-w-md p-4 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex flex-col items-center mb-8">
                    <div className="relative flex h-16 w-16 mb-4 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-primary text-white shadow-lg shadow-primary/30">
                        <KeyRound className="h-8 w-8" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Esqueceu a senha?</h1>
                    <p className="text-muted-foreground mt-2 text-center">Informe seu e-mail e enviaremos um link para criar uma nova.</p>
                </div>

                <div className="glass-panel rounded-3xl p-8 shadow-2xl shadow-black/5">
                    {sent ? (
                        <div className="flex flex-col items-center text-center gap-3">
                            <Mail className="h-10 w-10 text-primary" />
                            <p className="font-semibold text-foreground">Verifique sua caixa de entrada</p>
                            <p className="text-sm text-muted-foreground">
                                Se existir uma conta com <strong>{email}</strong>, você vai receber um link válido por 1 hora. Olhe também o spam.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={onSubmit} className="space-y-5">
                            {error && (
                                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center font-medium">
                                    {error}
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-foreground/80">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="name@example.com"
                                    className="h-12 px-4 rounded-xl bg-background/50 font-medium"
                                />
                            </div>
                            <Button type="submit" size="lg" className="w-full h-12 rounded-xl text-base" disabled={loading}>
                                {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Enviando...</> : 'Enviar link'}
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
