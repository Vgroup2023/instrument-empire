import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { importStatementFile } from '@/lib/bookkeeping/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A PDF or photo is read by Claude, which can take a while.
export const maxDuration = 120;

/** POST { accountId, fileName, mimeType, data: base64 }. CSV and OFX/QFX are read exactly; PDF and images are read by Claude. */
export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request, 6_500_000);
    return NextResponse.json({ result: await importStatementFile(body) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
