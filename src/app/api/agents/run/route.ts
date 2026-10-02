import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { runAgentsNow } from '@/lib/agents/runner';
import { runDesk } from '@/lib/desk/agents';
import { apiErrorResponse } from '@/lib/apiError';
import { verifyPayload } from '@/lib/crypto';
import { APP_SESSION_COOKIE } from '@/lib/cookieNames';

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
    const secret = process.env.SESSION_SECRET;
    const token = (await cookies()).get(APP_SESSION_COOKIE)?.value;
    const payload = secret ? await verifyPayload<{ ok: boolean }>(token, secret) : null;
    allowed = Boolean(payload?.ok);
  }
  if (!allowed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json({ results: await runAgentsNow(), desk: await runDesk() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
