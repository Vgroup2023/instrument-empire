import { NextResponse } from 'next/server';
import { runCrmAgents } from '@/lib/crm/agents';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 26;

/** "Run the agents now" from the CRM page (signed-in users only; the proxy checks the session). */
export async function POST() {
  try {
    return NextResponse.json({ results: await runCrmAgents() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
