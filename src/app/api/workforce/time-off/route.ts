import { NextRequest, NextResponse } from 'next/server';
import { createTimeOff, listTimeOff } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    return NextResponse.json({ requests: await listTimeOff(p.get('from') ?? '', p.get('to') ?? '') });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await createTimeOff(await readJson(request));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
