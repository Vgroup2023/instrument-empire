import { NextRequest, NextResponse } from 'next/server';
import { setFindingStatus } from '@/lib/agents/runner';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { ids?: string[]; status?: string };
    if (!Array.isArray(body.ids) || !['open', 'resolved', 'dismissed'].includes(body.status ?? '')) {
      return NextResponse.json({ error: 'ids and a valid status are required.' }, { status: 400 });
    }
    await setFindingStatus(body.ids, body.status as 'open' | 'resolved' | 'dismissed');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
