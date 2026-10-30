import { NextRequest, NextResponse } from 'next/server';
import { createFirstOwner } from '@/lib/auth/service';
import { getCurrentUser, resetLegacyMemo } from '@/lib/auth/current';
import { createUserSessionCookie } from '@/lib/session';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** { name, email, password }: makes the first (owner) account. Only possible from the shared-passphrase session, and only once. */
export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me?.legacy || me.role !== 'owner') return NextResponse.json({ error: 'Sign in with the shared passphrase to set up the first account.' }, { status: 403 });
    const user = await createFirstOwner(await readJson(request));
    resetLegacyMemo();
    await createUserSessionCookie(user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
