import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { asRecord } from '@/lib/validation';
import { reviewReturn } from '@/lib/tax/review';
import { cleanInputs, getTaxReturn } from '@/lib/tax/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST { inputs? } -> the AI review of a return. If the answers currently on screen are sent they are reviewed (they may
 * not have finished saving); otherwise the saved answers are. Nothing is stored and the return is never changed.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const row = await getTaxReturn((await params).id);
    const body = asRecord(await readJson(request), 'The request');
    const inputs = body.inputs === undefined ? row.inputs : cleanInputs(body.inputs);
    return NextResponse.json({ review: await reviewReturn({ country: row.country, taxYear: row.taxYear, inputs }) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
