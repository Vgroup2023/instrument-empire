import { NextRequest, NextResponse } from 'next/server';
import { clearAppSessionCookie } from '@/lib/session';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  clearAppSessionCookie();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
