import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { approveConfident } from '@/lib/bookkeeping/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 26;

export async function POST() {
  try {
    return NextResponse.json({ result: await approveConfident() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
