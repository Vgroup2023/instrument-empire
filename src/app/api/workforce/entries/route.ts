import { NextRequest, NextResponse } from 'next/server';
import { createEntry, listEntries } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    return NextResponse.json({ entries: await listEntries(p.get('from') ?? '', p.get('to') ?? '', p.get('employeeId') ?? undefined) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json({ entry: await createEntry(await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
