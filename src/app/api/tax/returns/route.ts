import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { createTaxReturn, listTaxReturns } from '@/lib/tax/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ returns: await listTaxReturns() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json({ taxReturn: await createTaxReturn(await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
