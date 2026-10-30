import { NextRequest, NextResponse } from 'next/server';
import { acceptToken } from '@/lib/auth/service';
import { createUserSessionCookie } from '@/lib/session';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { asRecord } from '@/lib/validation';
import { getClientKey, isRateLimited, recordFailedAttempt } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** { token, password }: uses an invitation or reset link, sets the password and signs the person in. */
export async function POST(request: NextRequest) {
  const key = `accept:${getClientKey(request)}`;
  if (isRateLimited(key)) return NextResponse.json({ error: 'Too many attempts. Wait a few minutes.' }, { status: 429 });
  try {
    const body = asRecord(await readJson(request));
    const user = await acceptToken(String(body.token ?? ''), body.password);
    await createUserSessionCookie(user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    recordFailedAttempt(key);
    return apiErrorResponse(err);
  }
}
