import type { LlmClient } from '@/lib/llm/json';
import { deliverPending, enqueueAlert } from './alerts';
import { businessInfo, type Contact, type Activity } from './model';
import type { InboundResult } from './service';
import { applyTriage, triageMessage, type AppliedTriage, type Triage } from './triage';

/** A priority at or above this makes a message worth interrupting someone for. */
export const HOT_PRIORITY = 70;
/** An open deal this big makes a pricing or meeting message worth an alert on its own. */
export const BIG_DEAL = 10_000;

/** Raises an alert for a message that deserves one. Returns the new alert's id, or null if none was queued. */
export async function raiseInboundAlert(
  a: Pick<Activity, 'id' | 'contactId' | 'dealId'>,
  contact: Pick<Contact, 'name' | 'business'> | null,
  t: Triage,
  applied: AppliedTriage,
): Promise<string | null> {
  if (!applied.claimed || t.intent === 'unsubscribe') return null;
  const who = contact?.name ?? 'A contact';
  const business = businessInfo(contact?.business)?.name ?? null;
  const base = { business: contact?.business ?? null, contactId: a.contactId, dealId: a.dealId, body: t.summary };
  const tag = business ? ` (${business})` : '';
  if (t.intent === 'complaint') {
    return (await enqueueAlert({ ...base, dedupeKey: `complaint:${a.id}`, kind: 'complaint', severity: 'critical', title: `Unhappy customer: ${who}${tag}` })).id;
  }
  if (t.intent === 'meeting_request' && applied.dealValue >= BIG_DEAL) {
    return (await enqueueAlert({ ...base, dedupeKey: `meeting:${a.id}`, kind: 'meeting_request', severity: 'important', title: `${who} wants to meet about a big deal${tag}` })).id;
  }
  if (applied.priority >= HOT_PRIORITY || (t.intent === 'pricing' && applied.dealValue >= BIG_DEAL)) {
    return (await enqueueAlert({ ...base, dedupeKey: `hot:${a.id}`, kind: 'hot_lead', severity: 'important', title: `High-priority message from ${who}${tag}` })).id;
  }
  return null;
}

/**
 * Runs the moment something arrives: reads it, does what it calls for, raises any alert and sends it. It has a short
 * time budget so the sender's webhook still answers quickly, and it never throws: anything left over is picked up by
 * the next agent run. The result is also what the inbox agent would have done, so nothing is done twice.
 */
export async function afterInbound(r: InboundResult, opts: { llm?: LlmClient } = {}): Promise<void> {
  const a = r.activity;
  if (r.duplicate || a.direction !== 'in' || !['email', 'sms', 'note'].includes(a.kind)) return;
  try {
    const t = await triageMessage(
      { subject: a.kind === 'sms' ? null : a.summary, body: `${a.summary}\n${a.detail ?? ''}`, contactName: r.contact.name },
      { llm: opts.llm, timeoutMs: 4000 },
    );
    const applied = await applyTriage(a, r.contact, t, { actor: 'Inbox', newContact: r.createdContact });
    const alertId = await raiseInboundAlert(a, r.contact, t, applied);
    // Send only this message's alert now; anything older that is still waiting is picked up by the agent run.
    if (alertId) await deliverPending({ ids: [alertId], budgetMs: 2500 });
  } catch (err) {
    console.error('crm: inbound triage failed; the next agent run will retry', err instanceof Error ? err.message : err);
  }
}
