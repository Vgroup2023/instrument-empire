import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { restrictedParties } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bulk add: one party name per line. */
export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as { names?: string; listName?: string };
    const names = [...new Set((body.names ?? '').split('\n').map((n) => n.trim()).filter(Boolean))];
    if (!names.length) return NextResponse.json({ error: 'Enter at least one name.' }, { status: 400 });
    await getDb()
      .insert(restrictedParties)
      .values(names.map((name) => ({ name, listName: body.listName?.trim() || 'Internal' })));
    return NextResponse.json({ added: names.length });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
    await getDb().delete(restrictedParties).where(eq(restrictedParties.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
