import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Zap,
  Shield,
  Bot,
  Layers,
  Radio,
  ArrowUpRight,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  Lock,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Orbita | Plataforma & Gateway de WhatsApp Empresarial",
  description:
    "A infraestrutura de WhatsApp para empresas: orquestração de múltiplas sessões, IA conversacional e API REST de alta performance.",
  openGraph: {
    title: "Orbita | Plataforma & Gateway de WhatsApp Empresarial",
    description:
      "A infraestrutura de WhatsApp para empresas: orquestração de múltiplas sessões, IA conversacional e API REST de alta performance.",
    type: "website",
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3030",
  },
  twitter: {
    card: "summary_large_image",
    title: "Orbita | Plataforma & Gateway de WhatsApp Empresarial",
    description:
      "A infraestrutura de WhatsApp para empresas: orquestração de múltiplas sessões, IA conversacional e API REST de alta performance.",
  },
};

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#070a11] text-[#edf3fb] selection:bg-[#62e4da]/30 selection:text-white font-sans antialiased overflow-x-hidden">
      {/* Background Tech Grid & Dynamic Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {/* Animated Tech Grid */}
        <div
          className="absolute inset-0 opacity-[0.09] animate-grid-drift"
          style={{
            backgroundImage:
              "linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 50% 15%, #000 35%, transparent 85%)",
            WebkitMaskImage: "radial-gradient(ellipse at 50% 15%, #000 35%, transparent 85%)",
          }}
        />
        {/* Glowing Aurora */}
        <div className="absolute -top-[12%] left-1/2 -translate-x-1/2 w-[850px] h-[480px] bg-gradient-to-b from-[#62e4da]/20 via-[#4f89ff]/10 to-transparent blur-[140px] rounded-full animate-aurora" />
        <div className="absolute top-[45%] -right-[10%] w-[550px] h-[550px] bg-[#8d9bff]/10 blur-[150px] rounded-full animate-aurora" style={{ animationDelay: "3s" }} />
      </div>

      {/* Clean Floating Navbar */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-[#070a11]/70 border-b border-white/[0.06] transition-all">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative h-9 w-9 rounded-xl overflow-hidden shadow-md shadow-[#62e4da]/20 ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-105">
              <Image
                src="/orbita-logo.png"
                alt="Orbita"
                width={36}
                height={36}
                className="w-full h-full object-cover"
                priority
              />
            </div>
            <div className="flex items-baseline font-bold text-lg tracking-tight text-white">
              <span>Orbita</span>
              <span className="text-[#62e4da]">.io</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#9daabd]">
            <Link href="#solucoes" className="hover:text-white transition-colors">
              Soluções
            </Link>
            <Link href="#como-funciona" className="hover:text-white transition-colors">
              Como Funciona
            </Link>
            <Link href="#faq" className="hover:text-white transition-colors">
              Perguntas
            </Link>
            <Link href="/docs" className="hover:text-[#62e4da] transition-colors flex items-center gap-1">
              Documentação API
              <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/auth/login">
              <Button
                variant="ghost"
                size="sm"
                className="text-[#9daabd] hover:text-white hover:bg-white/[0.06] rounded-full px-4 text-sm"
              >
                Entrar
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button
                size="sm"
                className="relative overflow-hidden rounded-full px-5 py-2 font-semibold text-sm bg-gradient-to-r from-[#62e4da] to-[#38bdf8] text-[#070a11] hover:opacity-95 shadow-[0_0_24px_rgba(98,228,218,0.25)] transition-all group"
              >
                <span>Acessar Painel</span>
                <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative z-10">
        {/* Hero Section */}
        <section className="relative px-4 sm:px-6 max-w-6xl mx-auto pt-14 pb-16 lg:pt-20 lg:pb-28">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-10 items-center">
            {/* Left: Text & Pitch */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-xs font-mono tracking-wider uppercase bg-[#62e4da]/10 border border-[#62e4da]/20 text-[#62e4da]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#62e4da] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#62e4da]"></span>
                </span>
                <span>Ecossistema Orbita · WhatsApp Gateway</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-black tracking-tight text-white leading-[1.14]">
                A infraestrutura de WhatsApp que{" "}
                <span className="bg-gradient-to-r from-[#62e4da] via-[#38bdf8] to-[#8d9bff] bg-clip-text text-transparent animate-spectrum">
                  conecta sua operação.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-[#9daabd] max-w-xl mx-auto lg:mx-0 font-normal leading-relaxed">
                Conecte múltiplos números, automatize atendimentos com inteligência artificial e sincronize leads em um CRM Kanban completo — com API REST e webhooks em tempo real.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link href="/dashboard" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto h-13 px-8 rounded-full text-base font-semibold bg-gradient-to-r from-[#62e4da] via-[#38bdf8] to-[#62e4da] text-[#070a11] shadow-[0_0_32px_rgba(98,228,218,0.3)] hover:shadow-[0_0_45px_rgba(98,228,218,0.45)] transition-all group"
                  >
                    <span>Começar agora</span>
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/docs" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full sm:w-auto h-13 px-7 rounded-full text-base font-medium border-white/10 bg-white/[0.02] text-[#edf3fb] hover:bg-white/[0.06] hover:border-white/20 backdrop-blur-md"
                  >
                    Documentação API
                  </Button>
                </Link>
              </div>

              {/* Minimal Numbers / Proof points */}
              <div className="pt-6 grid grid-cols-3 gap-6 border-t border-white/[0.06] max-w-md mx-auto lg:mx-0 text-left">
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white tracking-tight font-mono">99.9%</div>
                  <div className="text-xs text-[#9daabd] mt-0.5">Uptime estável</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-[#62e4da] tracking-tight font-mono">&lt; 150ms</div>
                  <div className="text-xs text-[#9daabd] mt-0.5">Latência de disparo</div>
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-white tracking-tight font-mono">100%</div>
                  <div className="text-xs text-[#9daabd] mt-0.5">Auto-hospedado</div>
                </div>
              </div>
            </div>

            {/* Right: Floating Product Mockup */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-md sm:max-w-lg relative animate-mockup-float">
                {/* Glow behind product mockup */}
                <div className="absolute inset-0 bg-gradient-to-tr from-[#62e4da]/20 to-[#8d9bff]/20 rounded-3xl blur-2xl -z-10" />

                <div className="rounded-2xl border border-white/[0.12] bg-[#0c121d]/90 backdrop-blur-2xl shadow-[0_30px_90px_rgba(0,0,0,0.8)] overflow-hidden">
                  {/* Window Bar */}
                  <div className="h-10 px-4 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                    </div>
                    <span className="text-[11px] font-mono tracking-wider text-[#9daabd] uppercase">
                      orbita / workspace
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#62e4da] bg-[#62e4da]/10 px-2 py-0.5 rounded-full border border-[#62e4da]/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#62e4da] animate-pulse" />
                      AO VIVO
                    </div>
                  </div>

                  {/* Window Body */}
                  <div className="p-5 flex flex-col gap-4">
                    {/* Live KPIs */}
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#9daabd] block">
                          Atendimentos
                        </span>
                        <span className="text-base font-bold text-white block mt-0.5">3.842</span>
                        <span className="text-[10px] text-[#62e4da] font-mono">+28% hoje</span>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#9daabd] block">
                          Sessões
                        </span>
                        <span className="text-base font-bold text-white block mt-0.5">12 ativas</span>
                        <span className="text-[10px] text-[#38bdf8] font-mono">100% Baileys</span>
                      </div>
                      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#9daabd] block">
                          IA Match
                        </span>
                        <span className="text-base font-bold text-white block mt-0.5">95%</span>
                        <span className="text-[10px] text-emerald-400 font-mono">Gemini Pro</span>
                      </div>
                    </div>

                    {/* Live Conversation Stream */}
                    <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5 text-[#62e4da]" /> Agente IA Autônomo
                        </span>
                        <span className="text-[10px] font-mono text-[#9daabd]">há 4s</span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-start gap-2 bg-[#070a11]/60 p-2.5 rounded-lg border border-white/[0.04]">
                          <div className="h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                            WA
                          </div>
                          <div className="text-[11px] leading-tight text-white/90">
                            <span className="text-[#9daabd] block text-[9px] mb-0.5">Cliente (+55 11 98821-...)</span>
                            &ldquo;Gostaria de agendar uma reunião comercial para minha equipe.&rdquo;
                          </div>
                        </div>

                        <div className="flex items-start gap-2 bg-[#62e4da]/[0.08] p-2.5 rounded-lg border border-[#62e4da]/20">
                          <div className="h-6 w-6 rounded-full bg-[#62e4da] text-[#070a11] flex items-center justify-center text-[10px] font-bold shrink-0">
                            AI
                          </div>
                          <div className="text-[11px] leading-tight text-white/90">
                            <span className="text-[#62e4da] block text-[9px] font-semibold mb-0.5">
                              Orbita IA · 380ms
                            </span>
                            &ldquo;Perfeito! Reservei seu card no Kanban e separei os horários disponíveis.&rdquo;
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-white/[0.05] text-[10px] font-mono text-[#9daabd]">
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Lead movido para Kanban &gt; Qualificado
                        </span>
                        <span className="bg-white/10 px-2 py-0.5 rounded text-white text-[9px]">200 OK</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Soluções (4 Cards Essenciais e Respirados) */}
        <section id="solucoes" className="py-24 border-t border-white/[0.06] relative">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
              <span className="text-xs font-mono uppercase tracking-widest text-[#62e4da]">
                Soluções
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Tudo o que sua operação precisa para escalar.
              </h2>
              <p className="text-[#9daabd] text-base">
                Quatro pilares integrados em uma interface limpa, intuitiva e auto-hospedada.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-[#62e4da]/30 transition-all duration-300 group">
                <div className="h-11 w-11 rounded-xl bg-[#62e4da]/10 text-[#62e4da] flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <Radio className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Múltiplas Conexões WhatsApp</h3>
                <p className="text-sm text-[#9daabd] leading-relaxed">
                  Conecte quantos números precisar. Cada sessão roda em processo isolado via Baileys com geração de QR Code instantânea e reconexão automática.
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-[#38bdf8]/30 transition-all duration-300 group">
                <div className="h-11 w-11 rounded-xl bg-[#38bdf8]/10 text-[#38bdf8] flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <Bot className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Agentes com Inteligência Artificial</h3>
                <p className="text-sm text-[#9daabd] leading-relaxed">
                  Automatize o atendimento com IA treinada no seu negócio. Qualifique leads, responda dúvidas frequentes e direcione o contato para o atendente correto.
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-[#a78bfa]/30 transition-all duration-300 group">
                <div className="h-11 w-11 rounded-xl bg-[#a78bfa]/10 text-[#a78bfa] flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <Layers className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">CRM Kanban Integrado</h3>
                <p className="text-sm text-[#9daabd] leading-relaxed">
                  Acompanhe cada conversa por etapas de funil comercial. Atribua tags, registre notas internas e execute rotinas de follow-up sem deixar contatos para trás.
                </p>
              </div>

              <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-emerald-400/30 transition-all duration-300 group">
                <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                  <Code2 className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">API REST &amp; Webhooks Robustos</h3>
                <p className="text-sm text-[#9daabd] leading-relaxed">
                  Envie mensagens, áudios e arquivos por endpoints documentados no Swagger. Receba eventos na hora com webhooks e tipagem TypeScript em ponta a ponta.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Como Funciona (3 Passos Claros e Diretos) */}
        <section id="como-funciona" className="py-24 border-t border-white/[0.06] bg-[#0a0f19]/40 relative">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl mb-16 space-y-3">
              <span className="text-xs font-mono uppercase tracking-widest text-[#62e4da]">
                Como Funciona
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Do primeiro QR Code à automação ativa
              </h2>
              <p className="text-[#9daabd] text-base">
                Simples de configurar, sem contratos abusivos por mensagem.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="space-y-4">
                <div className="text-2xl font-black font-mono text-[#62e4da]">01.</div>
                <h3 className="text-lg font-bold text-white">Sincronize o WhatsApp</h3>
                <p className="text-sm text-[#9daabd] leading-relaxed">
                  Escaneie o QR Code diretamente no painel. A conexão é estabelecida em segundos através do protocolo Baileys.
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-2xl font-black font-mono text-[#38bdf8]">02.</div>
                <h3 className="text-lg font-bold text-white">Configure IA e Regras</h3>
                <p className="text-sm text-[#9daabd] leading-relaxed">
                  Defina mensagens automáticas, ajuste o prompt do agente de IA e organize as colunas do seu funil no Kanban.
                </p>
              </div>

              <div className="space-y-4">
                <div className="text-2xl font-black font-mono text-[#a78bfa]">03.</div>
                <h3 className="text-lg font-bold text-white">Integre com seu Sistema</h3>
                <p className="text-sm text-[#9daabd] leading-relaxed">
                  Conecte seu CRM, loja ou ERP através de webhooks e API REST para disparar mensagens no piloto automático.
                </p>
              </div>
            </div>

            {/* Banner de Garantia & Soberania */}
            <div className="mt-14 p-6 sm:p-7 rounded-2xl bg-white/[0.02] border border-white/[0.08] flex items-center gap-5">
              <div className="h-10 w-10 rounded-xl bg-[#62e4da]/15 text-[#62e4da] flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-bold text-white">
                  Seus dados e conexões permanecem inteiramente no seu servidor.
                </h4>
                <p className="text-xs sm:text-sm text-[#9daabd] mt-0.5">
                  Sem intermediários lendo suas mensagens, sem taxas por conversa e sem fidelidade obrigatória.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Perguntas Frequentes (FAQ Acordeão Elegante) */}
        <section id="faq" className="py-24 border-t border-white/[0.06] relative">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-14 space-y-3">
              <span className="text-xs font-mono uppercase tracking-widest text-[#62e4da]">
                Dúvidas
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Perguntas Frequentes
              </h2>
            </div>

            <div className="space-y-3">
              <FaqItem
                question="Posso conectar múltiplos números de WhatsApp simultaneamente?"
                answer="Sim. O Orbita conta com um gerenciador multi-sessão. Cada número opera de forma isolada, com seus próprios webhooks, agente de IA e fluxo de mensagens."
              />
              <FaqItem
                question="Como funciona o agente com Inteligência Artificial?"
                answer="Basta conectar sua chave de API (como Google Gemini Pro). O agente compreende o contexto do seu negócio, responde humanamente e movimenta o lead no funil do Kanban."
              />
              <FaqItem
                question="Existe cobrança por mensagem enviada ou recebida?"
                answer="Não. O Orbita é auto-hospedado. A conexão de WhatsApp é direta, sem custos adicionais de terceiros ou taxas ocultas por disparo."
              />
              <FaqItem
                question="É fácil de integrar via API em qualquer sistema?"
                answer="Sim. Disponibilizamos endpoints REST com documentação Swagger interativa para envio de mensagens, mídias e áudios, além de webhooks em tempo real."
              />
            </div>
          </div>
        </section>

        {/* CTA Final */}
        <section className="py-20 border-t border-white/[0.06] relative overflow-hidden bg-gradient-to-b from-transparent to-[#0a0f19]">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-6">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Pronto para orquestrar seu WhatsApp?
            </h2>
            <p className="text-[#9daabd] text-base max-w-xl mx-auto">
              Acesse o painel do Orbita agora mesmo e coloque seu atendimento no piloto automático.
            </p>
            <div className="pt-2">
              <Link href="/dashboard">
                <Button
                  size="lg"
                  className="h-13 px-8 rounded-full text-base font-semibold bg-[#62e4da] text-[#070a11] hover:bg-[#62e4da]/90 shadow-[0_0_35px_rgba(98,228,218,0.35)]"
                >
                  Abrir Painel Orbita
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-[#070a11] py-10 relative z-10 text-sm text-[#9daabd]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-lg overflow-hidden border border-white/20">
              <Image
                src="/orbita-logo.png"
                alt="Orbita"
                width={28}
                height={28}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-bold text-white text-base">
              Orbita<span className="text-[#62e4da]">.io</span>
            </span>
          </div>

          <div className="flex gap-6 text-xs sm:text-sm">
            <Link href="/docs" className="hover:text-white transition-colors">
              Documentação
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacidade
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Termos
            </Link>
          </div>

          <p className="text-xs text-[#9daabd]/60">
            © {new Date().getFullYear()} Orbita IO. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5 [&_svg]:open:-rotate-180 transition-all duration-200">
      <summary className="flex cursor-pointer items-center justify-between font-semibold text-white text-base select-none list-none">
        <span>{question}</span>
        <ChevronDown className="h-5 w-5 text-[#62e4da] transition-transform duration-200 shrink-0 ml-4" />
      </summary>
      <p className="mt-3 text-sm text-[#9daabd] leading-relaxed border-t border-white/[0.04] pt-3">
        {answer}
      </p>
    </details>
  );
}
