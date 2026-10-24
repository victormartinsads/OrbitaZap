import { createAuthToken } from "@/lib/tokens";
import { appUrl, resetPasswordTemplate, sendEmail, verifyEmailTemplate } from "@/lib/email";
import { HOUR } from "@/lib/rate-limit";

export async function sendVerificationEmail(user: { id: string; name: string | null; email: string }) {
    const token = await createAuthToken(user.id, "EMAIL_VERIFY", 24 * HOUR);
    const { subject, html } = verifyEmailTemplate(user.name, appUrl(`/api/account/verify-email?token=${token}`));
    return sendEmail({ to: user.email, subject, html });
}

export async function sendPasswordResetEmail(user: { id: string; name: string | null; email: string }) {
    const token = await createAuthToken(user.id, "PASSWORD_RESET", HOUR);
    const { subject, html } = resetPasswordTemplate(user.name, appUrl(`/auth/reset-password?token=${token}`));
    return sendEmail({ to: user.email, subject, html });
}
