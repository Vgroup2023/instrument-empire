import { NextRequest, NextResponse } from 'next/server';
import { issueLink } from '@/lib/auth/service';
import { getCurrentUser } from '@/lib/auth/current';
import { sendInviteEmail, inviteLink } from '@/lib/auth/invite';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A fresh invitation or password-reset link for a person. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCurrentUser();
    if (!me || me.legacy) return NextResponse.json({ error: me ? 'Create your own owner account first.' : 'Unauthorized' }, { status: me ? 409 : 401 });
    const { id } = await params;
    const r = await issueLink(me, id);
    const link = inviteLink(request, r.token);
    const emailed = await sendInviteEmail(r.user.email, r.user.name, me.name, link, r.kind);
    return NextResponse.json({ link, emailed, kind: r.kind, expiresAt: r.expiresAt });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
