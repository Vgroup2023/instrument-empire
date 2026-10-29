import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavIcon } from '@/components/layout/NavIcon';
import { cn } from '@/lib/cn';
import { timeAgo, pctChange, LOW_STOCK_AT, type ActivityItem, type Overview } from '@/lib/dashboard/overview';
import { Donut, SalesLineChart, compact } from './Charts';

const card = 'rounded-2xl border border-slate-200/80 bg-white shadow-card';
const money0 = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
const num = (v: number) => v.toLocaleString('en-US');

function Delta({ now, before, label = 'vs last month' }: { now: number; before: number; label?: string }) {
  const pct = pctChange(now, before);
  if (pct === null) return <p className="mt-1 text-[11px] text-slate-400">{before === 0 && now === 0 ? 'No activity yet' : 'No comparison yet'}</p>;
  const up = pct >= 0;
  return (
    <p className="mt-1 text-[11px] text-slate-500">
      <span className={cn('font-semibold', up ? 'text-emerald-600' : 'text-red-600')}>{up ? '▲' : '▼'} {Math.abs(pct)}%</span> {label}
    </p>
  );
}

function Kpi({ href, label, value, icon, tint, children }: { href: string; label: string; value: string; icon: string; tint: string; children: ReactNode }) {
  return (
    <Link prefetch={false} href={href} className={cn(card, 'group flex items-start justify-between p-5 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500')}>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-slate-600">{label}</p>
        <p className="mt-2 text-[28px] font-bold leading-none tracking-tight text-[#0f2447]">{value}</p>
        {children}
      </div>
      <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tint)}><NavIcon name={icon} size={24} /></span>
    </Link>
  );
}

function Unavailable({ what }: { what: string }) {
  return <p className="text-xs text-slate-400">{what} could not be loaded just now.</p>;
}

export function KpiRow({ o }: { o: Overview }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" title="Month to date, compared with the same days of last month">
      <Kpi href="/dashboard/invoices" label="Total revenue" icon="trend" tint="bg-emerald-50 text-emerald-600" value={o.sales ? money0(o.sales.thisMonth) : '—'}>
        {o.sales ? <Delta now={o.sales.thisMonth} before={o.sales.lastMonthSamePeriod} /> : <Unavailable what="Revenue" />}
      </Kpi>
      <Kpi href="/dashboard/orders" label="New orders" icon="cart" tint="bg-blue-50 text-blue-600" value={o.orders ? num(o.orders.thisMonth) : '—'}>
        {o.orders ? <Delta now={o.orders.thisMonth} before={o.orders.lastMonthSamePeriod} /> : <Unavailable what="Orders" />}
      </Kpi>
      <Kpi href="/dashboard/customers" label="Total customers" icon="users" tint="bg-violet-50 text-violet-600" value={o.customers ? num(o.customers.total) : '—'}>
        {o.customers ? <p className="mt-1 text-[11px] text-slate-500"><span className="font-semibold text-emerald-600">+{num(o.customers.newThisMonth)}</span> added this month</p> : <Unavailable what="Customers" />}
      </Kpi>
      <Kpi href="/dashboard/agents" label="Open tasks" icon="alert" tint="bg-amber-50 text-amber-600" value={o.tasks ? num(o.tasks.total) : '—'}>
        {o.tasks ? (
          <p className="mt-1 text-[11px] text-slate-500">
            {o.tasks.urgent > 0 ? <span className="font-semibold text-red-600">{o.tasks.urgent} critical or high</span> : <span className="font-semibold text-emerald-600">Nothing urgent</span>}
          </p>
        ) : <Unavailable what="Tasks" />}
      </Kpi>
    </div>
  );
}

function CardHead({ title, href, link }: { title: string; href?: string; link?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[15px] font-semibold text-[#0f2447]">{title}</h3>
      {href ? <Link prefetch={false} href={href} className="text-xs font-medium text-brand-700 hover:underline">{link ?? 'Open'}</Link> : null}
    </div>
  );
}

export function SalesCard({ o }: { o: Overview }) {
  return (
    <section className={cn(card, 'flex h-full flex-col p-5')} aria-labelledby="ov-sales">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="ov-sales" className="text-[15px] font-semibold text-[#0f2447]">Sales overview</h3>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#22b45a]" />This month</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#c3cbd6]" />Last month</span>
        </div>
      </div>
      {o.sales ? <SalesLineChart points={o.sales.points} monthName={o.monthLabel} /> : <Unavailable what="Sales" />}
      <p className="mt-auto pt-2 text-[11px] text-slate-400">Running total of invoiced sales by day of the month. Percent changes compare with the same days of last month.</p>
    </section>
  );
}

const STATUS_COLORS: Record<string, string> = { confirmed: '#22b45a', processing: '#2548c4', shipped: '#6d3fd6', hold: '#f5a524' };

export function OrdersCard({ o }: { o: Overview }) {
  const od = o.orders;
  return (
    <section className={cn(card, 'h-full p-5')} aria-labelledby="ov-orders">
      <CardHead title="Orders status" href="/dashboard/orders" link="Order desk" />
      {od ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
          <Donut total={od.total} caption="Orders this month" slices={od.byStatus.map((s) => ({ label: s.label, value: s.count, color: STATUS_COLORS[s.key] }))} />
          <ul className="w-full space-y-2.5 text-[13px]">
            {od.byStatus.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[s.key] }} />{s.label}</span>
                <span className="tabular-nums text-slate-800">{num(s.count)} <span className="text-slate-400">({od.total ? Math.round((s.count / od.total) * 100) : 0}%)</span></span>
              </li>
            ))}
          </ul>
        </div>
      ) : <Unavailable what="Orders" />}
    </section>
  );
}

const ACTIVITY_STYLE: Record<ActivityItem['kind'], { icon: string; tint: string }> = {
  order: { icon: 'cart', tint: 'bg-emerald-50 text-emerald-600' },
  payment: { icon: 'wallet', tint: 'bg-blue-50 text-blue-600' },
  stock: { icon: 'box', tint: 'bg-amber-50 text-amber-600' },
  customer: { icon: 'users', tint: 'bg-violet-50 text-violet-600' },
  finding: { icon: 'bot', tint: 'bg-red-50 text-red-600' },
  shipment: { icon: 'truck', tint: 'bg-sky-50 text-sky-600' },
};

export function ActivityCard({ o }: { o: Overview }) {
  return (
    <section className={cn(card, 'p-5')} aria-labelledby="ov-activity">
      <CardHead title="Recent activity" />
      {o.activity.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Nothing yet. Orders, payments, new customers and agent findings show up here.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {o.activity.map((a, i) => {
            const st = ACTIVITY_STYLE[a.kind];
            return (
              <li key={i}>
                <Link prefetch={false} href={a.href} className="flex items-start gap-2.5 py-2.5 hover:bg-slate-50/70">
                  <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', st.tint)}><NavIcon name={st.icon} size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-slate-800" title={a.title}>{a.title}</span>
                    <span className="block truncate text-[11px] text-slate-500" title={a.detail}>{a.detail}</span>
                    <span className="block text-[10.5px] text-slate-400">{timeAgo(a.at)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link prefetch={false} href="/dashboard/audit-log" className="mt-2 block text-center text-xs font-medium text-brand-700 hover:underline">View all activity →</Link>
    </section>
  );
}

function Row({ dot, label, value, valueClass }: { dot: string; label: string; value: ReactNode; valueClass?: string }) {
  return (
    <li className="flex items-center justify-between text-[13px]">
      <span className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: dot }} />{label}</span>
      <span className={cn('font-semibold tabular-nums text-slate-800', valueClass)}>{value}</span>
    </li>
  );
}

function MiniCard({ href, title, big, sub, icon, tint, children }: { href: string; title: string; big: string; sub: string; icon: string; tint: string; children: ReactNode }) {
  return (
    <Link prefetch={false} href={href} className={cn(card, 'group block p-5 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold text-[#0f2447]">{title}</p>
          <p className="mt-2 text-[26px] font-bold leading-none text-[#0f2447]">{big}</p>
          <p className="mt-1 text-[11px] text-slate-500">{sub}</p>
        </div>
        <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tint)}><NavIcon name={icon} size={24} /></span>
      </div>
      <ul className="mt-4 space-y-2">{children}</ul>
    </Link>
  );
}

export function InventoryCard({ o }: { o: Overview }) {
  const i = o.inventory;
  if (!i) return <section className={cn(card, 'p-5')}><Unavailable what="Inventory" /></section>;
  const tracked = i.tracked > 0;
  return (
    <MiniCard href="/dashboard/products" title="Inventory status" icon="box" tint="bg-emerald-50 text-emerald-600"
      big={num(tracked ? i.tracked : i.services)} sub={tracked ? 'Stock-tracked products' : 'Products & services'}>
      {tracked ? (
        <>
          <Row dot="#22b45a" label="In stock" value={num(i.inStock)} />
          <Row dot="#f5a524" label={`Low stock (${LOW_STOCK_AT} or fewer)`} value={num(i.low)} />
          <Row dot="#ef4444" label="Out of stock" value={num(i.out)} valueClass={i.out > 0 ? 'text-red-600' : undefined} />
        </>
      ) : (
        <li className="text-[12px] text-slate-400">Switch on stock tracking for a product to see levels here.</li>
      )}
    </MiniCard>
  );
}

export function CustomerCard({ o }: { o: Overview }) {
  const c = o.customers;
  if (!c) return <section className={cn(card, 'p-5')}><Unavailable what="Customers" /></section>;
  return (
    <MiniCard href="/dashboard/customers" title="Customer activity" icon="users" tint="bg-blue-50 text-blue-600" big={num(c.active90)} sub="Customers billed in the last 90 days">
      <Row dot="#2548c4" label="New this month" value={num(c.newThisMonth)} />
      <Row dot="#22b45a" label="Existing and returning" value={num(c.returning)} />
      <Row dot="#94a3b8" label="All customers" value={num(c.total)} />
    </MiniCard>
  );
}

export function TeamCard({ o }: { o: Overview }) {
  const t = o.team;
  if (!t) return <section className={cn(card, 'p-5')}><Unavailable what="Team" /></section>;
  return (
    <MiniCard href="/dashboard/time" title="Team activity" icon="users" tint="bg-violet-50 text-violet-600" big={num(t.active)} sub="Active team members">
      <Row dot="#22b45a" label="Clocked in now" value={num(t.clockedIn)} />
      <Row dot="#f5a524" label="Hours to approve" value={num(t.toApprove)} />
      <Row dot="#2548c4" label="Time off requests" value={num(t.timeOffPending)} />
    </MiniCard>
  );
}

export function FinancialCard({ revenue, expenses, net, available }: { revenue: number; expenses: number; net: number; available: boolean }) {
  return (
    <Link prefetch={false} href="/dashboard/ar-ap" className={cn(card, 'group block p-5 transition hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[15px] font-semibold text-[#0f2447]">Financial overview</p>
          <p className="mt-3 text-[28px] font-bold leading-none text-[#0f2447]">{available ? money0(net) : '—'}</p>
          <p className="mt-1 text-[11px] text-slate-500">Net profit this month</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><NavIcon name="wallet" size={24} /></span>
      </div>
      {available ? (
        <ul className="mt-4 space-y-2">
          <Row dot="#22b45a" label="Revenue" value={money0(revenue)} />
          <Row dot="#ef4444" label="Expenses" value={money0(expenses)} valueClass="text-red-600" />
        </ul>
      ) : <p className="mt-4 text-xs text-slate-400">The month&apos;s figures could not be loaded just now.</p>}
    </Link>
  );
}

export function OperationalBar({ o }: { o: Overview }) {
  const op = o.operations;
  const item = (icon: string, label: string, value: string, tone: 'ok' | 'warn' | 'muted') => (
    <div className="flex items-center gap-3">
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-full border', tone === 'ok' ? 'border-emerald-200 text-emerald-600' : tone === 'warn' ? 'border-amber-300 text-amber-600' : 'border-slate-200 text-slate-400')}><NavIcon name={icon} size={18} /></span>
      <div><p className="text-[11px] text-slate-500">{label}</p><p className={cn('text-[13px] font-bold', tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-500')}>{value}</p></div>
    </div>
  );
  return (
    <section aria-label="Operational status" className={cn(card, 'flex flex-wrap items-center gap-x-10 gap-y-4 px-5 py-4')}>
      <h3 className="text-[15px] font-semibold text-[#0f2447]">Operational status</h3>
      {op ? (
        <>
          {item('shield', 'Database', `Online · ${op.dbMs} ms`, 'ok')}
          {item('truck', 'Orders shipped on time', op.onTimePct === null ? 'No shipments to measure' : `${op.onTimePct}% (30 days)`, op.onTimePct === null ? 'muted' : op.onTimePct >= 90 ? 'ok' : 'warn')}
          {item('inbox', 'Customer replies', op.supportWaiting === 0 ? 'All handled' : `${op.supportWaiting} waiting`, op.supportWaiting === 0 ? 'ok' : 'warn')}
          {item('users', 'Staff with time today', String(op.activeToday), 'muted')}
        </>
      ) : <p className="text-xs text-slate-400">Status could not be loaded just now.</p>}
    </section>
  );
}
