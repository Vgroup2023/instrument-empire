import nodemailer, { type Transporter } from 'nodemailer';
import { smtpConfig } from '@/lib/config';

let cached: Transporter | undefined;

function getTransport(): Transporter {
  if (!cached) {
    cached = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: smtpConfig.user ? { user: smtpConfig.user, pass: smtpConfig.password } : undefined,
    });
  }
  return cached;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends a real email via the SMTP server configured in the environment
 * (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_FROM). Throws a clear,
 * actionable error if SMTP isn't configured, rather than silently no-op'ing
 * — a caller asking to email a customer should know it didn't happen.
 */
export async function sendMail(input: SendMailInput): Promise<void> {
  if (!smtpConfig.isConfigured) {
    throw new Error(
      'Email sending isn’t configured yet. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM (see README) to enable sending invoices, estimates, and reminders.',
    );
  }
  await getTransport().sendMail({
    from: smtpConfig.from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
