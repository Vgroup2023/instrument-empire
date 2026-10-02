import type { AgentContext, Finding } from './types';
import { dayStart } from './types';

const DAY = 86_400_000;

/**
 * CBP Periodic Monthly Statement: duty for entries released in a month is due
 * on the 15th working day of the following month. This skips weekends only;
 * federal holidays can move the date by a day or more, so treat it as an
 * early warning and confirm in ACE.
 */
export function statementDueDate(year: number, monthIndex: number): Date {
  const d = new Date(Date.UTC(year, monthIndex + 1, 1));
  let working = 0;
  while (true) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) working += 1;
    if (working === 15) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

export function runBillBot(ctx: AgentContext): Finding[] {
  const out: Finding[] = [];
  const today = Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth(), ctx.now.getUTCDate());

  for (const inv of ctx.invoices) {
    if (inv.balance <= 0 || !inv.dueDate) continue;
    const overdue = Math.floor((today - dayStart(inv.dueDate).getTime()) / DAY);
    if (overdue < 1) continue;
    const sinceReminder = inv.lastReminderSentAt
      ? Math.floor((today - new Date(inv.lastReminderSentAt).getTime()) / DAY)
      : null;
    const quiet = overdue <= 6 ? 3 : overdue <= 29 ? 7 : 14;
    if (sinceReminder !== null && sinceReminder < quiet) continue;
    out.push({
      agent: 'billbot',
      severity: overdue > 29 ? 'high' : overdue > 6 ? 'medium' : 'low',
      dedupeKey: `bill:remind:${inv.id}`,
      title: `Invoice ${inv.docNumber ?? ''} for ${inv.customerName} is ${overdue}d overdue`,
      detail: `Balance ${inv.balance.toFixed(2)}. Open the invoice to review and send a reminder.`,
      action: { type: 'link', href: '/dashboard/invoices' },
    });
  }

  for (const s of ctx.shipments) {
    if (s.status === 'completed' && !s.invoicedAt) {
      out.push({
        agent: 'billbot',
        severity: 'medium',
        shipmentId: s.id,
        dedupeKey: `bill:unbilled:${s.id}`,
        title: `${s.reference}: completed but not invoiced`,
        detail: 'Create the client invoice so brokerage and duty charges are not delayed.',
        action: { type: 'link', href: '/dashboard/invoices' },
      });
    }
  }

  // Warehouse storage past the free days that nobody has billed yet.
  for (const s of ctx.shipments) {
    const w = s.warehouse;
    if (!w?.receivedAt || w.storageBilledAt || !w.dailyRate) continue;
    const end = w.releasedAt ? new Date(w.releasedAt).getTime() : today;
    const days = Math.floor((end - new Date(w.receivedAt).getTime()) / DAY) - w.freeDays;
    if (days <= 0) continue;
    const amount = days * w.dailyRate;
    out.push({
      agent: 'billbot',
      severity: amount >= 500 ? 'medium' : 'low',
      shipmentId: s.id,
      dedupeKey: `bill:storage:${s.id}`,
      title: `${s.reference}: ${days} storage day${days === 1 ? '' : 's'} not billed (${amount.toFixed(2)})`,
      detail: `${w.freeDays} free days, then ${w.dailyRate.toFixed(2)} per day${w.releasedAt ? ', released' : ', still in the warehouse'}. Add it to the client invoice, then mark storage billed on the shipment.`,
      action: { type: 'link', href: `/dashboard/shipments/${s.id}` },
    });
  }

  for (const b of ctx.bills) {
    if (b.balance <= 0 || !b.dueDate) continue;
    const days = Math.floor((dayStart(b.dueDate).getTime() - today) / DAY);
    if (days > 3) continue;
    out.push({
      agent: 'billbot',
      severity: days < 0 ? 'high' : 'low',
      dedupeKey: `bill:ap:${b.id}`,
      title: `Bill ${b.docNumber ?? ''} from ${b.vendorName} ${days < 0 ? `is ${-days}d overdue` : `is due in ${days}d`}`,
      detail: b.approved ? 'Approved and ready to pay.' : 'Not approved yet. Approve it before paying.',
      action: { type: 'link', href: '/dashboard/bills' },
    });
  }

  // Statement date for the previous month's released entries.
  const prev = new Date(Date.UTC(ctx.now.getUTCFullYear(), ctx.now.getUTCMonth() - 1, 1));
  const due = statementDueDate(prev.getUTCFullYear(), prev.getUTCMonth());
  const inPrevMonth = ctx.shipments.filter((s) => {
    if (s.direction !== 'import' || !s.entryFiledAt) return false;
    const d = new Date(s.entryFiledAt);
    return d.getUTCFullYear() === prev.getUTCFullYear() && d.getUTCMonth() === prev.getUTCMonth();
  });
  const daysToDue = Math.floor((due.getTime() - today) / DAY);
  if (inPrevMonth.length && daysToDue >= 0 && daysToDue <= 5) {
    const key = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
    out.push({
      agent: 'billbot',
      severity: daysToDue <= 1 ? 'critical' : 'high',
      dedupeKey: `bill:statement:${key}`,
      title: `CBP statement due ${due.toISOString().slice(0, 10)} (${daysToDue}d)`,
      detail: `${inPrevMonth.length} entr${inPrevMonth.length === 1 ? 'y' : 'ies'} filed in ${key}. Collect duty from clients and fund the ACH debit. Holidays may move this date, so confirm in ACE.`,
    });
  }
  return out;
}
