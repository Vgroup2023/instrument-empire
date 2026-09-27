import { NextRequest, NextResponse } from 'next/server';
import { createAppSessionCookie } from '@/lib/session';
import { getAppPassword } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const next = String(form.get('next') ?? '/dashboard');

  let expected: string;
  try {
    expected = getAppPassword();
  } catch {
    return NextResponse.json(
      { error: 'APP_PASSWORD is not configured on the server.' },
      { status: 500 },
    );
  }

  if (password !== expected) {
    const url = new URL('/login', request.url);
    url.searchParams.set('error', '1');
    url.searchParams.set('next', next);
    return NextResponse.redirect(url, { status: 303 });
  }

  await createAppSessionCookie();
  const safeNext = next.startsWith('/') ? next : '/dashboard';
  return NextResponse.redirect(new URL(safeNext, request.url), { status: 303 });
}
