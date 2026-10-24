import { logger } from "@/lib/logger";

const APP_NAME = process.env.APP_NAME || "OrbitaZap";

export function appUrl(path: string) {
    const base = (process.env.BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
    return `${base}${path}`;
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        if (process.env.NODE_ENV === "production") {
            logger.error("Email", `RESEND_API_KEY não configurada; e-mail "${subject}" para ${to} não foi enviado`);
        } else {
            const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
            logger.info("Email", `[modo dev, sem envio] Para: ${to} | ${subject} | ${links.join(" ")}`);
        }
        return false;
    }

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from: process.env.EMAIL_FROM || `${APP_NAME} <onboarding@resend.dev>`,
            to,
            subject,
            html,
        }),
    });
    if (!res.ok) {
        logger.error("Email", `Resend recusou o e-mail para ${to}: ${res.status} ${await res.text()}`);
        return false;
    }
    return true;
}

const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout({ name, intro, button, url, outro }: { name: string | null; intro: string; button: string; url: string; outro: string }) {
    return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px">
      <tr><td style="font-size:20px;font-weight:bold;color:#0084cc;padding-bottom:16px">${APP_NAME}</td></tr>
      <tr><td style="font-size:15px;line-height:1.6">
        <p style="margin:0 0 12px">Olá${name ? `, ${escapeHtml(name)}` : ""}!</p>
        <p style="margin:0 0 24px">${intro}</p>
        <p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#00bcfe;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:999px">${button}</a></p>
        <p style="margin:0 0 8px;font-size:13px;color:#64748b">Se o botão não funcionar, copie e cole este link no navegador:</p>
        <p style="margin:0 0 24px;font-size:12px;word-break:break-all"><a href="${url}" style="color:#0084cc">${url}</a></p>
        <p style="margin:0;font-size:13px;color:#64748b">${outro}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function verifyEmailTemplate(name: string | null, url: string) {
    return {
        subject: `Confirme seu e-mail no ${APP_NAME}`,
        html: layout({
            name,
            intro: "Falta só um passo: confirme seu e-mail para conectar seus WhatsApps e assinar um plano.",
            button: "Confirmar e-mail",
            url,
            outro: "O link vale por 24 horas. Se você não criou esta conta, ignore este e-mail.",
        }),
    };
}

export function resetPasswordTemplate(name: string | null, url: string) {
    return {
        subject: `Redefinir sua senha do ${APP_NAME}`,
        html: layout({
            name,
            intro: "Recebemos um pedido para redefinir a sua senha. Clique no botão abaixo para criar uma nova.",
            button: "Criar nova senha",
            url,
            outro: "O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.",
        }),
    };
}
