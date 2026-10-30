import { NextRequest, NextResponse } from 'next/server';
import { changesSince, snapshot } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The whole CRM, or with ?since=<time> only what changed after that time (the live feed polls this). */
export async function GET(request: NextRequest) {
  try {
    const since = request.nextUrl.searchParams.get('since');
    return NextResponse.json(since ? await changesSince(since) : await snapshot());
  } catch (err) {
    return apiErrorResponse(err);
  }
}
