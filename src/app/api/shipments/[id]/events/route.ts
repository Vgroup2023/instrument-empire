import { NextRequest, NextResponse } from 'next/server';
import { addShipmentEvent } from '@/lib/agents/events';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = (await readJson(request)) as unknown as { type?: string; location?: string; note?: string; occurredAt?: string };
    if (!b.type) return NextResponse.json({ error: 'An event type is required.' }, { status: 400 });
    await addShipmentEvent({ shipmentId: id, type: b.type, location: b.location, note: b.note, occurredAt: b.occurredAt });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/Unknown event type|valid date/.test(message)) return NextResponse.json({ error: message }, { status: 400 });
    return apiErrorResponse(err);
  }
}
