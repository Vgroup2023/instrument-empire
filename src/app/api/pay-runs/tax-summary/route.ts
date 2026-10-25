import { NextRequest, NextResponse } from 'next/server';
import { taxSummary } from '@/lib/payroll/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    return NextResponse.json({ summary: await taxSummary(Number(p.get('year')), Number(p.get('quarter'))) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
