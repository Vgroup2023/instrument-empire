import { NextRequest, NextResponse } from 'next/server';
import { copyWeek } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    return NextResponse.json(await copyWeek(body.fromWeek, body.toWeek));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
