import { NextRequest, NextResponse } from 'next/server';
import { removeInvitation, updateUser } from '@/lib/auth/service';
import { getCurrentUser } from '@/lib/auth/current';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** { name?, role?, departments?, status?: "active" | "disabled" }. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCurrentUser();
    if (!me || me.legacy) return NextResponse.json({ error: me ? 'Create your own owner account first.' : 'Unauthorized' }, { status: me ? 409 : 401 });
    const { id } = await params;
    return NextResponse.json({ user: await updateUser(me, id, await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** Cancels an invitation nobody accepted. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCurrentUser();
    if (!me || me.legacy) return NextResponse.json({ error: me ? 'Create your own owner account first.' : 'Unauthorized' }, { status: me ? 409 : 401 });
    const { id } = await params;
    await removeInvitation(me, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
