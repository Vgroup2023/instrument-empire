import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

import { importStatement } from '@/lib/bookkeeping/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Categorizing unfamiliar lines can call Claude, so allow the longest the host permits.
export const maxDuration = 26;

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request, 2_500_000);
    return NextResponse.json({ result: await importStatement(body.accountId, body.csvText) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
