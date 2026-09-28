import { NextRequest, NextResponse } from 'next/server';
import { clearAppSessionCookie } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  await clearAppSessionCookie();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
