import { NextRequest, NextResponse } from 'next/server';
import { inviteUser, listUsers } from '@/lib/auth/service';
import { getCurrentUser } from '@/lib/auth/current';

import { sendInviteEmail, inviteLink } from '@/lib/auth/invite';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const all = await listUsers();
    // A department manager sees only people in their own departments.
    const visible = me.role === 'manager' ? all.filter((u) => u.departments.some((d) => me.departments.includes(d))) : all;
    return NextResponse.json({ users: visible });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** { name, email, role, departments }: adds a person and returns their invitation link (and emails it when email is set up). */
export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.legacy) return NextResponse.json({ error: 'Create your own owner account first (the box at the top of this page), then add people.' }, { status: 409 });
    const result = await inviteUser({ ...me, name: me.name }, await readJson(request));
    const link = inviteLink(request, result.token);
    const emailed = await sendInviteEmail(result.user.email, result.user.name, me.name, link, result.kind);
    return NextResponse.json({ user: result.user, link, emailed, expiresAt: result.expiresAt });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
