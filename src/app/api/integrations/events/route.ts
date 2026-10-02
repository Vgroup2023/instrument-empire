import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { shipments } from '@/db/schema';
import { addShipmentEvent } from '@/lib/agents/events';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Inbound feed for carriers, TMS, WMS or any system that can send a webhook.
 * POST { reference, type, location?, note?, occurredAt? } with
 * "Authorization: Bearer $INTEGRATION_KEY". Events attach to the shipment with
 * that file reference. Disabled until INTEGRATION_KEY is set.
 */
export async function POST(request: NextRequest) {
  const key = process.env.INTEGRATION_KEY;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  if (!key || !sameSecret(provided, key)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const b = (await request.json()) as { reference?: string; type?: string; location?: string; note?: string; occurredAt?: string; source?: string };
    if (!b.reference || !b.type) return NextResponse.json({ error: 'reference and type are required.' }, { status: 400 });
    const [s] = await getDb().select({ id: shipments.id }).from(shipments).where(eq(shipments.reference, b.reference));
    if (!s) return NextResponse.json({ error: `No shipment with reference "${b.reference}".` }, { status: 404 });
    await addShipmentEvent({ shipmentId: s.id, type: b.type, location: b.location, note: b.note, occurredAt: b.occurredAt, source: b.source?.slice(0, 40) || 'integration' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/Unknown event type|valid date/.test(message)) return NextResponse.json({ error: message }, { status: 400 });
    return apiErrorResponse(err);
  }
}
