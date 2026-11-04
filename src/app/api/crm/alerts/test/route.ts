import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { channelsReady, deliverPending, enqueueAlert } from '@/lib/crm/alerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 26;

/** Sends a test alert to every channel that is set up, so the settings can be checked without waiting for a real event. */
export async function POST() {
  try {
    const ready = channelsReady();
    if (!ready.email && !ready.sms && !ready.teams) {
      return NextResponse.json({ error: 'No alert channel is set up yet. Add a Teams webhook (TEAMS_WEBHOOK_URL), alert emails (CRM_ALERT_EMAIL) or alert phone numbers (CRM_ALERT_SMS) in Netlify and redeploy.' }, { status: 400 });
    }
    const { id } = await enqueueAlert({
      dedupeKey: `test:${Date.now()}`, kind: 'test', severity: 'critical',
      title: 'Test alert from the CRM', body: 'If you can read this, instant alerts reach you here.',
    });
    const summary = await deliverPending({ limit: 5, budgetMs: 15000 });
    return NextResponse.json({ ok: true, id, ready, summary });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
