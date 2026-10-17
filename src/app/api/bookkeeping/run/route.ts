import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';

import { releaseOrphans, runBookkeeping } from '@/lib/bookkeeping/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 26;

/** Re-checks lines still waiting (for example after you add a rule or an account). Also callable by a scheduler with CRON_SECRET. */
export async function POST() {
  try {
    await releaseOrphans();
    return NextResponse.json({ result: await runBookkeeping({ reconsider: true }) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
