import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { handleInbound } from '@/lib/desk/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Inbound feed for the customer desk. Point an email-to-webhook service, a web
 * form, an EDI converter or a carrier at it with
 * "Authorization: Bearer $INTEGRATION_KEY". Bodies:
 *   { kind: "order", email, name?, rawText | lines[], shipTo? }
 *   { kind: "message", from, subject?, body }
 *   { kind: "shipment", orderNumber, event: "shipped" | "delivered", carrier?, trackingNo? }
 */
export async function POST(request: NextRequest) {
  const key = process.env.INTEGRATION_KEY;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  if (!key || !sameSecret(provided, key)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
  return handleInbound(body, 'api');
}
