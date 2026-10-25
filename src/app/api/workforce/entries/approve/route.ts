import { NextRequest, NextResponse } from 'next/server';
import { setApproved } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    return NextResponse.json({ changed: await setApproved(body.ids, body.approved !== false) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
