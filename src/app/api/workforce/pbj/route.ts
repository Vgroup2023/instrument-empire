import { NextRequest, NextResponse } from 'next/server';
import { parseQuarter, pbjPreview } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    return NextResponse.json({ preview: await pbjPreview(parseQuarter(p.get('fy'), p.get('q'))) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
