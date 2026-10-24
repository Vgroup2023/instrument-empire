import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { llmEnabled } from '@/lib/llm/json';
import { readSlipUpload } from '@/lib/tax/slips';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST { country, fileName, mimeType, data: base64 } -> the boxes read from a W-2 or T4. The file is not stored. */
export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request, 6_000_000);
    return NextResponse.json({ slip: await readSlipUpload(body, llmEnabled()) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
