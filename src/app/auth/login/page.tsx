'use client';

import { useState, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Bot, ArrowRight, Loader2 } from "lucide-react";
import Link from 'next/link';

const formSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(1, "A senha é obrigatória"),
});

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const notice =
    searchParams.get('reset') ? "Senha alterada. Entre com a nova senha." :
    searchParams.get('verified') ? "E-mail confirmado. Entre para continuar." :
    searchParams.get('registered') ? "Conta criada! Enviamos um link para confirmar seu e-mail." :
    null;
  const verifyError = searchParams.get('verify_error');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    setError(null);
    try {
      const result = await signIn('credentials', {
        redirect: false,
        email: values.email,
        password: values.password,
      });

      if (result?.code === "rate_limited") {
        setError("Muitas tentativas. Tente de novo em alguns minutos ou redefina sua senha.");
      } else if (result?.error) {
        setError("E-mail ou senha inválidos");
      } else {
        window.location.href = callbackUrl;
        router.refresh();
      }
    } catch (err) {
      setError("Ocorreu um erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen relative overflow-hidden bg-background">
      {/* Background Orbs */}
      <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 translate-x-1/3 translate-y-1/3 w-[30rem] h-[30rem] bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md p-4 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col items-center mb-8">
          <div className="relative flex h-16 w-16 mb-4 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-primary text-white shadow-lg shadow-primary/30">
            <Bot className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Bem-vindo de volta</h1>
          <p className="text-muted-foreground mt-2">Entre na sua conta do OrbitaZap</p>
        </div>

        <div className="glass-panel rounded-3xl p-8 shadow-2xl shadow-black/5 dark:shadow-black/40">
          {notice && !error && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-sm text-center font-medium">
              {notice}
            </div>
          )}
          {verifyError && !error && (
            <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 text-sm text-center font-medium">
              Este link de confirmação é inválido ou expirou. Entre e peça um novo pelo painel.
            </div>
          )}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center font-medium animate-in shake duration-300">
              {error}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground/80">Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="name@example.com"
                        className="h-12 px-4 rounded-xl bg-background/50 border-white/20 dark:border-white/10 focus-visible:ring-primary/50 transition-all font-medium"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-foreground/80">Senha</FormLabel>
                      <Link href="/auth/forgot-password" className="text-xs font-medium text-primary hover:text-primary/80">
                        Esqueci minha senha
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        className="h-12 px-4 rounded-xl bg-background/50 border-white/20 dark:border-white/10 focus-visible:ring-primary/50 transition-all font-medium"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                size="lg"
                className="w-full h-12 rounded-xl text-base shadow-lg shadow-primary/20 hover:shadow-primary/30 mt-2"
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Autenticando...</>
                ) : (
                  <>Entrar <ArrowRight className="ml-2 h-5 w-5" /></>
                )}
              </Button>
            </form>
          </Form>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Não tem uma conta?{" "}
          <Link href="/auth/register" className="font-semibold text-primary hover:text-primary/80 transition-colors">
            Criar uma conta
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
