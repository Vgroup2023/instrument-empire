import { NextResponse } from 'next/server';
import { clearQboTokens } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST() {
  clearQboTokens();
  return NextResponse.json({ ok: true });
}
