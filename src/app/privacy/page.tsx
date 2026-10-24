import Link from "next/link";
import { ArrowLeft, Lock, Shield } from "lucide-react";

export const metadata = {
    title: "Política de Privacidade | OrbitaZap",
    description: "Política de Privacidade do OrbitaZap, gateway de WhatsApp auto-hospedado. Arquitetura sem rastreamento, propriedade dos dados e práticas de segurança.",
    openGraph: {
        title: "Política de Privacidade | OrbitaZap",
        description: "Política de Privacidade do OrbitaZap, gateway de WhatsApp auto-hospedado.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Política de Privacidade | OrbitaZap",
        description: "Política de Privacidade do OrbitaZap, gateway de WhatsApp auto-hospedado.",
    },
};

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-background relative overflow-hidden py-24 selection:bg-primary/30 selection:text-primary-foreground">
            {/* Ambient background glows */}
            <div className="fixed top-0 right-1/4 translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-[120px] pointer-events-none -z-10" />
            <div className="fixed bottom-0 left-1/4 -translate-x-1/2 translate-y-1/2 w-[30rem] h-[30rem] bg-emerald-500/5 dark:bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none -z-10" />

            <div className="container max-w-4xl px-4 mx-auto relative z-10">

                <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground mb-8 transition-colors group">
                    <ArrowLeft className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    Voltar ao início
                </Link>

                <div className="glass-panel p-8 md:p-12 rounded-3xl shadow-xl shadow-black/5 dark:shadow-black/20 animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-blue-500/10 rounded-2xl">
                            <Shield className="h-8 w-8 text-blue-500" />
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">Política de Privacidade</h1>
                            <p className="text-muted-foreground mt-2">Data de vigência: {new Date().toLocaleDateString('pt-BR')}</p>
                        </div>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-p:leading-relaxed">

                        <p className="lead text-lg text-muted-foreground mb-8">
                            No OrbitaZap, acreditamos que seus dados são sua propriedade. Esta Política de Privacidade detalha os limites rigorosos sobre como as informações são tratadas ao usar nosso gateway de WhatsApp open source e auto-hospedado.
                        </p>

                        <h2 className="flex items-center gap-2 mt-8 text-2xl border-b pb-2">
                            <Lock className="h-6 w-6 text-blue-500" />
                            1. Arquitetura sem rastreamento
                        </h2>
                        <p>
                            Como o OrbitaZap foi projetado para ser <strong>auto-hospedado</strong>, todo o processamento principal de dados acontece exclusivamente no hardware em que você instala a aplicação.
                        </p>
                        <ul>
                            <li><strong>Sem telemetria centralizada:</strong> os criadores do OrbitaZap não recebem telemetria, análises nem relatórios de uso sobre as suas interações no WhatsApp.</li>
                            <li><strong>Propriedade total dos dados:</strong> seus contatos, mensagens, agendamentos e respostas automáticas ficam no seu próprio banco de dados. Não podemos e não vamos acessá-lo.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">2. Dados que processamos localmente</h2>
                        <p>
                            Quando você instala o gateway, a aplicação executada no seu servidor interage com:
                        </p>
                        <ul>
                            <li><strong>Credenciais de autenticação:</strong> as senhas que você cria para o painel passam por hash seguro com bcrypt antes de serem armazenadas no seu banco de dados local.</li>
                            <li><strong>Sessões do WhatsApp:</strong> o OrbitaZap funciona como uma ponte para o WhatsApp Web. Os tokens (chaves) de sessão necessários para manter essa conexão são armazenados localmente no seu servidor.</li>
                            <li><strong>Registros de comunicação:</strong> as mensagens enviadas e recebidas pelo gateway são registradas no seu banco de dados local para fornecer histórico e o funcionamento dos Webhooks.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">3. Protegendo suas informações</h2>
                        <p>
                            Embora o OrbitaZap seja construído com práticas modernas de segurança, a segurança final dos seus dados depende do seu ambiente de hospedagem. Recomendamos fortemente:
                        </p>
                        <ul>
                            <li>Instalar a aplicação atrás de um proxy reverso com <strong>criptografia SSL/TLS</strong> obrigatória (HTTPS).</li>
                            <li>Proteger o servidor com firewalls e autenticação por chave SSH.</li>
                            <li>Manter o sistema operacional e o ambiente Node.js sempre atualizados.</li>
                        </ul>

                        <h2 className="mt-8 text-2xl border-b pb-2">4. Integrações de terceiros</h2>
                        <p>
                            O OrbitaZap usa a biblioteca <code>@whiskeysockets/baileys</code> para se comunicar diretamente com os servidores do WhatsApp. Ao usar este gateway, seu servidor estabelece uma conexão WebSocket direta com o WhatsApp. Lembre-se de que o seu uso do WhatsApp continua sujeito à Política de Privacidade da Meta.
                        </p>

                        <div className="mt-12 p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                            <p className="font-semibold mb-2">Precisa de mais detalhes?</p>
                            <p className="text-sm text-muted-foreground mb-0">Se você tiver dúvidas específicas sobre o tratamento de dados ou quiser auditar o código, fale com o criador do OrbitaZap, Marcos Maia, pelo <Link href="https://instagram.com/marcolamaia">Instagram @marcolamaia</Link>.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
