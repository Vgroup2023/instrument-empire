import type { NextRequest } from 'next/server';
import { smtpConfig } from '@/lib/config';
import { sendCustomerMail } from '@/lib/desk/notify';
import { BRAND } from '@/lib/brand';

/** The address a person opens to choose their password. */
export function inviteLink(request: NextRequest, token: string): string {
  const base = (process.env.APP_BASE_URL ?? request.nextUrl.origin).replace(/\/$/, '');
  return `${base}/invite/${token}`;
}

/** Emails the link when email is set up. Returns whether it was sent; the link is always shown to the person who made it too. */
export async function sendInviteEmail(to: string, name: string, by: string, link: string, kind: 'invite' | 'reset'): Promise<boolean> {
  if (!smtpConfig.isConfigured) return false;
  const first = name.trim().split(/\s+/)[0] || 'there';
  const body =
    kind === 'invite'
      ? `Hi ${first},\n\n${by} has added you to ${BRAND.name}. Open this link to choose your password and sign in:\n\n${link}\n\nThe link works once and expires in 7 days.\n`
      : `Hi ${first},\n\n${by} sent you a link to set a new password for ${BRAND.name}:\n\n${link}\n\nThe link works once and expires in 24 hours. If you did not expect this, ignore this email.\n`;
  const r = await sendCustomerMail(to, kind === 'invite' ? `You're invited to ${BRAND.name}` : `Set a new password for ${BRAND.name}`, body);
  return r.ok;
}

/** The email for someone who asked for the link themselves ("Forgot your password?"). Returns whether it was sent. */
export async function sendSelfServiceEmail(to: string, name: string, link: string, kind: 'invite' | 'reset'): Promise<boolean> {
  if (!smtpConfig.isConfigured) return false;
  const first = name.trim().split(/\s+/)[0] || 'there';
  const body =
    kind === 'invite'
      ? `Hi ${first},\n\nYou asked for a new link to finish setting up your ${BRAND.name} account. Open it to choose your password and sign in:\n\n${link}\n\nThe link works once and expires in 7 days. If you did not ask for this, ignore this email.\n`
      : `Hi ${first},\n\nSomeone, hopefully you, asked to reset the password for your ${BRAND.name} account. Open this link to choose a new password:\n\n${link}\n\nThe link works once and expires in 24 hours. If you did not ask for this, ignore this email and your password stays the same.\n`;
  const r = await sendCustomerMail(to, kind === 'invite' ? `Finish setting up your ${BRAND.name} account` : `Reset your ${BRAND.name} password`, body);
  if (!r.ok) console.error('Password reset email was not sent:', r.reason);
  return r.ok;
}
