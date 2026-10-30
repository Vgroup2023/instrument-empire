import { NextRequest, NextResponse } from 'next/server';
import { runAgentsNow } from '@/lib/agents/runner';
import { runDesk } from '@/lib/desk/agents';
import { runCrmAgents } from '@/lib/crm/agents';
import { apiErrorResponse } from '@/lib/apiError';
import { getCurrentUser } from '@/lib/auth/current';
import { canAccess } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Runs the six trade agents and the four customer-desk agents. Called by the scheduler (Authorization: Bearer
 * $CRON_SECRET, same secret as /api/recurring/run-due) or by a signed-in user
 * clicking "Run now". The proxy lets this path through unauthenticated so the
 * scheduler can reach it, which means this handler must check access itself.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = request.headers.get('authorization')?.replace('Bearer ', '');
  let allowed = Boolean(cronSecret) && bearer === cronSecret;
  if (!allowed) {
    // A signed-in person who may work in Operations and is not view-only.
    const user = await getCurrentUser();
    allowed = Boolean(user) && canAccess(user!, '/api/agents/run', 'POST');
  }
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const results = await runAgentsNow();
    const desk = await runDesk();
    // A CRM problem must not hide the trade and desk results.
    const crm = await runCrmAgents().catch((err) => [{ agent: 'crm', handled: 0, error: err instanceof Error ? err.message : 'CRM agents failed' }]);
    return NextResponse.json({ results, desk, crm });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
