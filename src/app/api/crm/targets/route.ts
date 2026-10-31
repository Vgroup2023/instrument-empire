import { NextRequest, NextResponse } from 'next/server';
import { listTargets, setTarget } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';
import { asRecord } from '@/lib/validation';
import { readJsonAsUser } from '@/lib/crm/signedBody';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** ?period=2026-11 → that month's targets. */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ targets: await listTargets(request.nextUrl.searchParams.get('period') ?? '') });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** { period, owner?, amount }: sets (or with no amount, clears) a target. */
export async function PUT(request: NextRequest) {
  try {
    const body = asRecord(await readJsonAsUser(request));
    const actor = typeof body.actor === 'string' && body.actor.trim() ? body.actor.trim().slice(0, 80) : 'Office team';
    return NextResponse.json({ targets: await setTarget(body, actor) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
