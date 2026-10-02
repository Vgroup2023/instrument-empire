import { desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { agentRuns, orderEvents, orderLines, orders, serviceMessages } from '@/db/schema';
import { DESK_AGENTS } from '@/lib/agents/types';

export async function deskOverview() {
  const db = getDb();
  const [statusCounts, orderRows, messages, events, runs] = await Promise.all([
    db.select({ status: orders.status, n: sql<number>`cast(count(*) as int)` }).from(orders).groupBy(orders.status),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(60),
    db.select().from(serviceMessages).orderBy(desc(serviceMessages.createdAt)).limit(40),
    db
      .select({ id: orderEvents.id, agent: orderEvents.agent, action: orderEvents.action, detail: orderEvents.detail, createdAt: orderEvents.createdAt, orderNumber: orders.orderNumber })
      .from(orderEvents)
      .leftJoin(orders, eq(orderEvents.orderId, orders.id))
      .orderBy(desc(orderEvents.createdAt))
      .limit(40),
    db
      .select({ agent: agentRuns.agent, finishedAt: sql<Date | null>`max(${agentRuns.finishedAt})` })
      .from(agentRuns)
      .where(inArray(agentRuns.agent, DESK_AGENTS.map((a) => a.id)))
      .groupBy(agentRuns.agent),
  ]);
  const ids = orderRows.map((o) => o.id);
  const lines = ids.length ? await db.select().from(orderLines).where(inArray(orderLines.orderId, ids)) : [];
  const linesByOrder = new Map<string, string[]>();
  for (const l of lines) linesByOrder.set(l.orderId, [...(linesByOrder.get(l.orderId) ?? []), `${l.quantity} x ${l.description}`]);

  return {
    counts: Object.fromEntries(statusCounts.map((c) => [c.status, c.n])) as Record<string, number>,
    orders: orderRows.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      total: o.total === null ? null : Number(o.total),
      holdReason: o.holdReason,
      carrier: o.carrier,
      trackingNo: o.trackingNo,
      shipByDate: o.shipByDate,
      channel: o.channel,
      lines: linesByOrder.get(o.id) ?? [],
      createdAt: o.createdAt.toISOString(),
    })),
    messages: messages.map((m) => ({
      id: m.id,
      fromEmail: m.fromEmail,
      subject: m.subject,
      body: m.body,
      intent: m.intent,
      status: m.status,
      replyDraft: m.replyDraft,
      escalationReason: m.escalationReason,
      handledBy: m.handledBy,
      createdAt: m.createdAt.toISOString(),
    })),
    events: events.map((e) => ({ id: e.id, agent: e.agent, action: e.action, detail: e.detail, orderNumber: e.orderNumber, createdAt: e.createdAt.toISOString() })),
    lastRun: Object.fromEntries(runs.map((r) => [r.agent, r.finishedAt ? new Date(r.finishedAt).toISOString() : null])) as Record<string, string | null>,
  };
}

export type DeskOverview = Awaited<ReturnType<typeof deskOverview>>;
