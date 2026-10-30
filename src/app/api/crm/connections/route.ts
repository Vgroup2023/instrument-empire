import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { connectionStatus } from '@/lib/crm/comms';
import { lastCrmRuns } from '@/lib/crm/agents';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What is connected, the addresses to point other services at, and when each channel last received something. Never returns a secret. */
export async function GET(request: NextRequest) {
  try {
    const base = process.env.APP_BASE_URL ?? request.nextUrl.origin;
    const rows = await getDb().execute<{ channel: string; last_at: string | null; n: number }>(sql`
      select channel, max(created_at) as last_at, count(*)::int as n from crm_activities
      where direction = 'in' and channel is not null and created_at > now() - interval '30 days' group by channel`);
    return NextResponse.json({
      status: connectionStatus(base.replace(/\/$/, '')),
      received: Object.fromEntries(rows.map((r) => [r.channel, { lastAt: r.last_at ? new Date(r.last_at).toISOString() : null, count: Number(r.n) }])),
      agents: await lastCrmRuns(),
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
