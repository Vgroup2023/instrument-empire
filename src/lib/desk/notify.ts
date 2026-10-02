import { smtpConfig } from '@/lib/config';
import { sendMail } from '@/lib/email/mailer';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type SendResult = { ok: true } | { ok: false; reason: string };

/** Sends a plain-text email to a customer. Returns the outcome instead of throwing, so a mail problem never stops an order. */
export async function sendCustomerMail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!smtpConfig.isConfigured) return { ok: false, reason: 'Email is not configured (set SMTP_* in the environment).' };
  try {
    await sendMail({ to, subject, text, html: `<div style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(text)}</div>` });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Email failed.' };
  }
}

export function companyName(): string {
  return process.env.DESK_COMPANY_NAME || 'Customer Service';
}

export function autoSendEnabled(): boolean {
  return process.env.DESK_AUTO_SEND !== 'off';
}
