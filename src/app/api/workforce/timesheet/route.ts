import { NextRequest, NextResponse } from 'next/server';
import { weekTimesheet } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ sheet: await weekTimesheet(request.nextUrl.searchParams.get('date') ?? '') });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
