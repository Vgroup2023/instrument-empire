import { NextRequest, NextResponse } from 'next/server';
import { changeOwnPassword } from '@/lib/auth/service';
import { getCurrentUser } from '@/lib/auth/current';
import { createUserSessionCookie } from '@/lib/session';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { asRecord } from '@/lib/validation';
import { getClientKey, isRateLimited, recordFailedAttempt } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** { current, next }: changes your own password. Every other device is signed out; this one stays signed in. */
export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me?.id) return NextResponse.json({ error: 'Sign in with your own account to change a password.' }, { status: 403 });
  const key = `pw:${me.id}:${getClientKey(request)}`;
  if (isRateLimited(key)) return NextResponse.json({ error: 'Too many attempts. Wait a few minutes.' }, { status: 429 });
  try {
    const body = asRecord(await readJson(request));
    const user = await changeOwnPassword(me.id, body.current, body.next);
    await createUserSessionCookie(user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    recordFailedAttempt(key);
    return apiErrorResponse(err);
  }
}
