import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { seedSampleRules } from '@/lib/quoting/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Loads example prices, routing rules and prior jobs so the screens can be tried. Does nothing once routing rules exist. */
export async function POST() {
  try {
    return NextResponse.json(await seedSampleRules());
  } catch (err) {
    return apiErrorResponse(err);
  }
}
