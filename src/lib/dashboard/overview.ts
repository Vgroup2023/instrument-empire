import { cache } from 'react';
import { sql } from 'drizzle-orm';
import { withTimeout } from '@/lib/withTimeout';
import { getDb } from '@/db/client';
import { addDays, dateInZone } from '@/lib/workforce/time';

// The numbers on the master dashboard. Each group is its own query and any one that fails is left out (null), so a
// slow or missing table never takes the page down. Month-to-date figures are compared with the same days of last month.

export const LOW_STOCK_AT = 5;

export interface Delta {
  /** Percent change against the same days last month, or null when last month had nothing to compare. */
  pct: number | null;
}

export interface SalesPoint {
  day: number;
  /** Running total for the month up to this day. null after today for the current month. */
  thisMonth: number | null;
  lastMonth: number | null;
}

export interface Overview {
  today: string;
  monthStart: string;
  monthLabel: string;
  sales: { thisMonth: number; lastMonthSamePeriod: number; lastMonthTotal: number; points: SalesPoint[]; daysInMonth: number; todayDay: number } | null;
  orders: {
    thisMonth: number;
    lastMonthSamePeriod: number;
    byStatus: { key: 'confirmed' | 'processing' | 'shipped' | 'hold'; label: string; count: number }[];
    total: number;
  } | null;
  customers: { total: number; newThisMonth: number; newLastSamePeriod: number; active90: number; returning: number } | null;
  tasks: { total: number; urgent: number; findings: number; orders: number; replies: number; quotes: number } | null;
  inventory: { tracked: number; inStock: number; low: number; out: number; services: number } | null;
  team: { active: number; clockedIn: number; toApprove: number; timeOffPending: number } | null;
  activity: ActivityItem[];
  operations: { onTimePct: number | null; shippedChecked: number; supportWaiting: number; activeToday: number; dbMs: number } | null;
}

export interface ActivityItem {
  kind: 'order' | 'payment' | 'stock' | 'customer' | 'finding' | 'shipment';
  title: string;
  detail: string;
  at: string;
  href: string;
}

/** Per-query limit. Netlify ends a page render at 10 s, so the whole overview has to settle well inside that. */
const QUERY_BUDGET_MS = 4500;

const n = (v: unknown) => Number(v ?? 0);

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    // A query stuck behind a slow connection is given up on, so the card shows its empty state instead of the page timing out.
    return await withTimeout(fn(), QUERY_BUDGET_MS, 'Dashboard query took too long.');
  } catch (err) {
    if (process.env.DASHBOARD_DEBUG) console.error('dashboard overview query failed:', err);
    return null;
  }
}

function monthLabel(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function pctChange(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/** Never throws: if the database is unreachable the dashboard still renders, with every card in its empty state. */
export const getOverview = cache(async (): Promise<Overview> => {
  try {
    return await loadOverview();
  } catch (err) {
    if (process.env.DASHBOARD_DEBUG) console.error('dashboard overview failed:', err);
    const iso = new Date().toISOString().slice(0, 10);
    const monthStart = `${iso.slice(0, 7)}-01`;
    return { today: iso, monthStart, monthLabel: monthLabel(monthStart), sales: null, orders: null, customers: null, tasks: null, inventory: null, team: null, activity: [], operations: null };
  }
});

async function loadOverview(): Promise<Overview> {
  const db = getDb();
  // "Today" and "this month" follow the facility's own clock (set in Payroll Based Journal settings), not the server's.
  const tz = (await safe(async () => (await db.execute<{ timezone: string }>(sql`select timezone from workforce_settings where id = 1`))[0]?.timezone)) ?? 'America/New_York';
  const todayIso = dateInZone(new Date(), tz);
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7));
  const todayDay = Number(todayIso.slice(8, 10));
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const prevMonthStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const prevSameDay = addDays(prevMonthStart, Math.min(todayDay, prevDays) - 1);

  const [sales, orders, customers, tasks, inventory, team, activity, operations] = await Promise.all([
    safe(async () => {
      const rows = await db.execute<{ d: string; amt: string }>(sql`
        select i.txn_date::text as d, coalesce(sum(l.amount), 0) as amt
        from invoices i join invoice_lines l on l.invoice_id = i.id
        where i.txn_date >= ${prevMonthStart}::date and i.txn_date <= ${todayIso}::date
        group by i.txn_date`);
      const byDay = new Map(rows.map((r) => [r.d, n(r.amt)]));
      let runThis = 0;
      let runLast = 0;
      const points: SalesPoint[] = [];
      for (let day = 1; day <= Math.max(daysInMonth, prevDays); day++) {
        if (day <= prevDays) runLast += byDay.get(addDays(prevMonthStart, day - 1)) ?? 0;
        if (day <= todayDay) runThis += byDay.get(addDays(monthStart, day - 1)) ?? 0;
        if (day <= daysInMonth) points.push({ day, thisMonth: day <= todayDay ? Math.round(runThis * 100) / 100 : null, lastMonth: day <= prevDays ? Math.round(runLast * 100) / 100 : null });
      }
      let lastSame = 0;
      for (let day = 1; day <= Math.min(todayDay, prevDays); day++) lastSame += byDay.get(addDays(prevMonthStart, day - 1)) ?? 0;
      return { thisMonth: Math.round(runThis * 100) / 100, lastMonthSamePeriod: Math.round(lastSame * 100) / 100, lastMonthTotal: Math.round(runLast * 100) / 100, points, daysInMonth, todayDay };
    }),
    safe(async () => {
      const [r] = await db.execute<Record<string, string>>(sql`
        select
          count(*) filter (where created_at >= ${monthStart}::date and status <> 'cancelled') as this_month,
          count(*) filter (where created_at >= ${prevMonthStart}::date and created_at < ${prevSameDay}::date + 1 and status <> 'cancelled') as last_same,
          count(*) filter (where created_at >= ${monthStart}::date and status in ('confirmed','ready_to_ship')) as confirmed,
          count(*) filter (where created_at >= ${monthStart}::date and status in ('received','parsing','processing')) as processing,
          count(*) filter (where created_at >= ${monthStart}::date and status in ('shipped','delivered')) as shipped,
          count(*) filter (where created_at >= ${monthStart}::date and status in ('needs_review','on_hold')) as hold
        from orders`);
      const byStatus = [
        { key: 'confirmed' as const, label: 'Confirmed', count: n(r.confirmed) },
        { key: 'processing' as const, label: 'Processing', count: n(r.processing) },
        { key: 'shipped' as const, label: 'Shipped', count: n(r.shipped) },
        { key: 'hold' as const, label: 'Review or on hold', count: n(r.hold) },
      ];
      return { thisMonth: n(r.this_month), lastMonthSamePeriod: n(r.last_same), byStatus, total: byStatus.reduce((a, s) => a + s.count, 0) };
    }),
    safe(async () => {
      const [r] = await db.execute<Record<string, string>>(sql`
        select
          (select count(*) from customers where active) as total,
          (select count(*) from customers where created_at >= ${monthStart}::date) as new_this,
          (select count(*) from customers where created_at >= ${prevMonthStart}::date and created_at < ${prevSameDay}::date + 1) as new_last,
          (select count(distinct customer_id) from invoices where txn_date >= ${addDays(todayIso, -90)}::date) as active90,
          (select count(distinct i.customer_id) from invoices i join customers c on c.id = i.customer_id
             where i.txn_date >= ${addDays(todayIso, -90)}::date and c.created_at < ${monthStart}::date) as returning`);
      return { total: n(r.total), newThisMonth: n(r.new_this), newLastSamePeriod: n(r.new_last), active90: n(r.active90), returning: n(r.returning) };
    }),
    safe(async () => {
      const [r] = await db.execute<Record<string, string>>(sql`
        select
          (select count(*) from agent_findings where status = 'open') as findings,
          (select count(*) from agent_findings where status = 'open' and severity in ('critical','high')) as urgent,
          (select count(*) from orders where status in ('needs_review','on_hold')) as orders,
          (select count(*) from service_messages where status in ('awaiting_approval','escalated')) as replies,
          (select count(*) from rfqs where status = 'estimator_review') as quotes`);
      const findings = n(r.findings), o = n(r.orders), replies = n(r.replies), quotes = n(r.quotes);
      return { total: findings + o + replies + quotes, urgent: n(r.urgent), findings, orders: o, replies, quotes };
    }),
    safe(async () => {
      const [r] = await db.execute<Record<string, string>>(sql`
        select
          count(*) filter (where type = 'Inventory' and qty_on_hand is not null) as tracked,
          count(*) filter (where type = 'Inventory' and qty_on_hand > ${LOW_STOCK_AT}) as in_stock,
          count(*) filter (where type = 'Inventory' and qty_on_hand > 0 and qty_on_hand <= ${LOW_STOCK_AT}) as low,
          count(*) filter (where type = 'Inventory' and qty_on_hand <= 0) as out,
          count(*) filter (where type <> 'Inventory') as services
        from products where active`);
      return { tracked: n(r.tracked), inStock: n(r.in_stock), low: n(r.low), out: n(r.out), services: n(r.services) };
    }),
    safe(async () => {
      const [r] = await db.execute<Record<string, string>>(sql`
        select
          (select count(*) from payroll_employees where status = 'active') as active,
          (select count(*) from time_entries where clock_out is null) as clocked_in,
          (select count(*) from time_entries where clock_out is not null and not approved and work_date >= ${addDays(todayIso, -14)}::date) as to_approve,
          (select count(*) from time_off_requests where status = 'pending' and end_date >= ${todayIso}::date) as off_pending`);
      return { active: n(r.active), clockedIn: n(r.clocked_in), toApprove: n(r.to_approve), timeOffPending: n(r.off_pending) };
    }),
    safe(async () => {
      const rows = await db.execute<{ kind: ActivityItem['kind']; title: string; detail: string; at: string; href: string }>(sql`
        (select 'order' as kind, 'Order ' || order_number || ' ' || case when status in ('shipped','delivered') then 'shipped' else 'received' end as title,
                coalesce(customer_name, 'New order') as detail, created_at::text as at, '/dashboard/orders' as href
           from orders order by created_at desc limit 4)
        union all
        (select 'payment', 'Payment received', '$' || to_char(p.amount, 'FM999,999,990.00') || ' from ' || coalesce(c.display_name, 'a customer'), p.created_at::text, '/dashboard/payments'
           from invoice_payments p join invoices i on i.id = p.invoice_id left join customers c on c.id = i.customer_id order by p.created_at desc limit 4)
        union all
        (select 'customer', 'New customer added', display_name, created_at::text, '/dashboard/customers' from customers order by created_at desc limit 3)
        union all
        (select 'finding', 'Agent finding: ' || title, agent, created_at::text, '/dashboard/agents' from agent_findings where status = 'open' order by created_at desc limit 3)
        union all
        (select 'stock', 'Low stock alert', name || ' (' || trim(trailing '.' from trim(trailing '0' from qty_on_hand::text)) || ' left)', updated_at::text, '/dashboard/products'
           from products where active and type = 'Inventory' and qty_on_hand is not null and qty_on_hand <= ${LOW_STOCK_AT} order by updated_at desc limit 2)
        order by at desc limit 6`);
      return rows.map((r) => ({ kind: r.kind, title: r.title, detail: r.detail, at: r.at, href: r.href }));
    }),
    safe(async () => {
      const t0 = Date.now();
      const [r] = await db.execute<Record<string, string>>(sql`
        select
          (select count(*) from orders where shipped_at >= ${addDays(todayIso, -30)}::date and ship_by_date is not null) as checked,
          (select count(*) from orders where shipped_at >= ${addDays(todayIso, -30)}::date and ship_by_date is not null and shipped_at::date <= ship_by_date) as on_time,
          (select count(*) from service_messages where status in ('awaiting_approval','escalated')) as waiting,
          (select count(*) from time_entries where work_date = ${todayIso}::date) as active_today`);
      const checked = n(r.checked);
      return { onTimePct: checked ? Math.round((n(r.on_time) / checked) * 100) : null, shippedChecked: checked, supportWaiting: n(r.waiting), activeToday: n(r.active_today), dbMs: Date.now() - t0 };
    }),
  ]);

  return { today: todayIso, monthStart, monthLabel: monthLabel(monthStart), sales, orders, customers, tasks, inventory, team, activity: activity ?? [], operations };
}

/** '2m ago', '3h ago', 'Oct 12'. */
export function timeAgo(at: string, now = Date.now()): string {
  const t = new Date(at.replace(' ', 'T').replace(/\+00$/, 'Z')).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
