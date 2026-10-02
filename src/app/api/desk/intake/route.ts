import { NextRequest, NextResponse } from 'next/server';
import { handleInbound } from '@/lib/desk/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Signed-in staff entering an order or a customer message by hand. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });
  return handleInbound(body, 'manual');
}
