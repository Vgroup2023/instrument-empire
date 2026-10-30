import { smtpConfig } from '@/lib/config';
import { llmEnabled } from '@/lib/llm/json';
import { sendCustomerMail, type SendResult } from '@/lib/desk/notify';

// The ways the CRM sends and receives. Receiving needs INTEGRATION_KEY (the same key the order desk uses). Sending email
// needs the SMTP settings the invoices already use; sending texts needs a Twilio account.

export const twilio = {
  get sid() { return process.env.TWILIO_ACCOUNT_SID ?? ''; },
  get token() { return process.env.TWILIO_AUTH_TOKEN ?? ''; },
  get from() { return process.env.TWILIO_FROM ?? ''; },
  get isConfigured() { return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM); },
};

export async function sendEmail(to: string, subject: string, body: string): Promise<SendResult> {
  return sendCustomerMail(to, subject, body);
}

/** Sends a text through Twilio's REST API. Returns the outcome instead of throwing, like the email sender. */
export async function sendSms(to: string, body: string): Promise<SendResult & { id?: string }> {
  if (!twilio.isConfigured) return { ok: false, reason: 'Text messaging is not set up. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM in the environment.' };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilio.sid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilio.sid}:${twilio.token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: twilio.from, Body: body }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) return { ok: false, reason: data.message ?? `Twilio refused the message (${res.status}).` };
    return { ok: true, id: data.sid };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'The text could not be sent.' };
  }
}

export interface ConnectionStatus {
  baseUrl: string;
  receivingKeySet: boolean;
  emailOut: boolean;
  smsOut: boolean;
  ai: boolean;
  reportRecipients: string[];
}

export function reportRecipients(): string[] {
  return (process.env.CRM_REPORT_EMAIL ?? '').split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

export function connectionStatus(baseUrl: string): ConnectionStatus {
  return {
    baseUrl,
    receivingKeySet: Boolean(process.env.INTEGRATION_KEY),
    emailOut: smtpConfig.isConfigured,
    smsOut: twilio.isConfigured,
    ai: llmEnabled(),
    reportRecipients: reportRecipients(),
  };
}
