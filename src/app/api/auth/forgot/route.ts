import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { inviteLink, sendSelfServiceEmail } from '@/lib/auth/invite';
import { startPasswordReset } from '@/lib/auth/service';
import { smtpConfig } from '@/lib/config';
import { readJson } from '@/lib/http';
import { getClientKey, isRateLimited, recordFailedAttempt } from '@/lib/rateLimit';
import { asRecord } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Every answer takes about this long, so the time it takes does not give away whether the email has an account.
const MIN_MS = 1200;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * POST { email }: "Forgot your password?". If the email belongs to an account that can sign in, a one-time link to choose a
 * new password is emailed to it. The answer is the same whether or not the email has an account, so this can not be used to
 * find out who does. The link itself is only ever sent by email, never returned here.
 */
export async function POST(request: NextRequest) {
  const started = Date.now();
  // Every request counts, not just failures: this endpoint sends email.
  const key = `forgot:${getClientKey(request)}`;
  if (isRateLimited(key)) return NextResponse.json({ error: 'Too many requests. Wait a few minutes and try again.' }, { status: 429 });
  recordFailedAttempt(key);
  try {
    const body = asRecord(await readJson(request));
    if (!smtpConfig.isConfigured) {
      return NextResponse.json({ error: 'Resetting a password by email is not set up on this server yet. Ask the person who runs this app to set up email (SMTP).' }, { status: 503 });
    }
    const made = await startPasswordReset(body.email);
    if (made) await sendSelfServiceEmail(made.user.email, made.user.name, inviteLink(request, made.token), made.kind);
    const wait = MIN_MS - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
