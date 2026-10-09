import { randomUUID } from 'crypto';
import { getDb } from '@/db/client';
import type { Page } from '@/lib/paging';
import { invoices, invoiceLines, invoicePayments, customers, products, accounts } from '@/db/schema';
import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import { sendMail } from '@/lib/email/mailer';
import { formatCurrency, formatDate } from '@/lib/format';
import { toLineInsertRows, rowsToSalesDocLines, type LineItemInput, type LineRow } from '@/lib/accounting/salesLines';
import type { SalesDocLine } from '@/lib/quickbooks/salesTypes';
import {
  ConflictError,
  MAX_MONEY,
  NotFoundError,
  ValidationError,
  asRecord,
  dateNotBefore,
  isoDate,
  money,
  optEmail,
  optIsoDate,
  optText,
  optUuid,
  round2 as roundMoney,
  todayIso,
  uuid,
} from '@/lib/validation';
import { requireAccount, requireCustomer, requireProducts, parseSalesLines, BANK_ACCOUNT_TYPES, type Executor, type Tx } from '@/lib/accounting/entryRules';
import { nextDocNumber } from '@/lib/accounting/docNumbers';
import { escapeHtml } from '@/lib/html';

// This is the standalone, database-backed Invoices ledger — the app's own
// source of truth, not QuickBooks. See src/lib/quickbooks/invoices.ts for the
// (optional, separate) QuickBooks-backed equivalent. Recurring schedules
// (src/lib/accounting/recurring.ts) create their documents through this
// module too.

export interface Invoice {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  DueDate?: string;
  CustomerRef: { value: string; name?: string };
  BillEmail?: { Address: string };
  Line: SalesDocLine[];
  TotalAmt: number;
  Balance: number;
  CurrencyRef?: { value: string };
  ExchangeRate?: number;
  LastReminderSentAt?: string;
  MilestoneGroupId?: string;
  MilestoneLabel?: string;
}

type InvoiceRow = typeof invoices.$inferSelect;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Pass the open transaction as `ex` when reading back something just written inside it: the pool's other
// connections can't see uncommitted rows, and waiting on one while holding a connection can freeze the app.
async function attachDetails(rows: InvoiceRow[], ex: Executor = getDb()): Promise<Invoice[]> {
  if (rows.length === 0) return [];
  const db = ex;
  const ids = rows.map((r) => r.id);
  const customerIds = [...new Set(rows.map((r) => r.customerId))];

  const [lineRows, paymentRows, customerRows] = await Promise.all([
    db.select().from(invoiceLines).where(inArray(invoiceLines.invoiceId, ids)),
    db
      .select({ invoiceId: invoicePayments.invoiceId, amount: invoicePayments.amount })
      .from(invoicePayments)
      .where(inArray(invoicePayments.invoiceId, ids)),
    db.select({ id: customers.id, displayName: customers.displayName }).from(customers).where(inArray(customers.id, customerIds)),
  ]);

  const productIds = [...new Set(lineRows.map((l) => l.productId).filter((id): id is string => Boolean(id)))];
  const productRows = productIds.length
    ? await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds))
    : [];
  const productNameById = new Map(productRows.map((p) => [p.id, p.name]));
  const customerNameById = new Map(customerRows.map((c) => [c.id, c.displayName]));

  const linesByInvoice = new Map<string, LineRow[]>();
  for (const line of lineRows) {
    const list = linesByInvoice.get(line.invoiceId) ?? [];
    list.push(line);
    linesByInvoice.set(line.invoiceId, list);
  }
  const paidByInvoice = new Map<string, number>();
  for (const p of paymentRows) {
    paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + Number(p.amount));
  }

  return rows.map((row) => {
    const salesLines = rowsToSalesDocLines(linesByInvoice.get(row.id) ?? [], productNameById);
    const totalAmt = round2(salesLines.reduce((sum, l) => sum + l.Amount, 0));
    const paid = paidByInvoice.get(row.id) ?? 0;
    return {
      Id: row.id,
      SyncToken: row.updatedAt.getTime().toString(),
      DocNumber: row.docNumber ?? undefined,
      TxnDate: row.txnDate,
      DueDate: row.dueDate ?? undefined,
      CustomerRef: { value: row.customerId, name: customerNameById.get(row.customerId) },
      BillEmail: row.billEmail ? { Address: row.billEmail } : undefined,
      Line: salesLines,
      TotalAmt: totalAmt,
      Balance: round2(totalAmt - paid),
      CurrencyRef: { value: row.currencyCode },
      ExchangeRate: Number(row.exchangeRate),
      LastReminderSentAt: row.lastReminderSentAt?.toISOString(),
      MilestoneGroupId: row.milestoneGroupId ?? undefined,
      MilestoneLabel: row.milestoneLabel ?? undefined,
    };
  });
}

export async function listInvoices(): Promise<Invoice[]> {
  const db = getDb();
  const rows = await db.select().from(invoices).orderBy(desc(invoices.txnDate), desc(invoices.createdAt));
  return attachDetails(rows);
}

/** The newest `limit` rows after skipping `offset`, plus the overall count, so a tab can open fast and load more on request. */
export async function listInvoicesPage(limit: number, offset: number): Promise<Page<Invoice>> {
  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(invoices).orderBy(desc(invoices.txnDate), desc(invoices.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(invoices),
  ]);
  return { items: await attachDetails(rows), total: n };
}

/**
 * Invoices past their due date that still have a balance, oldest first. The
 * database does the filtering (and the overall count), so the Payments tab
 * doesn't have to load every invoice just to find the overdue ones.
 */
export async function listOverdueInvoices(limit: number): Promise<Page<Invoice>> {
  const db = getDb();
  const open = sql`i.due_date < CURRENT_DATE AND (
      COALESCE((SELECT SUM(amount) FROM invoice_lines WHERE invoice_id = i.id), 0)
      - COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = i.id), 0)) > 0`;
  const [idRows, countRows] = await Promise.all([
    db.execute<{ id: string }>(sql`SELECT i.id FROM invoices i WHERE ${open} ORDER BY i.due_date ASC, i.created_at ASC LIMIT ${limit}`),
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM invoices i WHERE ${open}`),
  ]);
  const ids = idRows.map((r) => r.id);
  if (ids.length === 0) return { items: [], total: 0 };
  const rows = await db.select().from(invoices).where(inArray(invoices.id, ids));
  const order = new Map(ids.map((id, index) => [id, index]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { items: await attachDetails(rows), total: countRows[0]?.n ?? ids.length };
}

export async function getInvoice(id: string, ex: Executor = getDb()): Promise<Invoice> {
  uuid(id, 'Invoice');
  const [row] = await ex.select().from(invoices).where(eq(invoices.id, id));
  if (!row) throw new NotFoundError('Invoice not found.');
  const [invoice] = await attachDetails([row], ex);
  return invoice;
}

export interface CreateInvoiceInput {
  customerId: string;
  customerName?: string;
  email?: string;
  txnDate?: string;
  dueDate?: string;
  lines: LineItemInput[];
}

/** Total of a set of lines, refused if it would not fit the amount columns. */
function checkedTotal(lines: LineItemInput[]): number {
  const total = roundMoney(lines.reduce((sum, l) => sum + roundMoney(l.quantity * l.unitPrice), 0));
  if (total > MAX_MONEY) throw new ValidationError('The invoice total is too large.');
  return total;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const raw = asRecord(input, 'The invoice');
  const customerId = uuid(raw.customerId, 'Customer');
  const lines = parseSalesLines(raw.lines);
  checkedTotal(lines);
  const txnDate = optIsoDate(raw.txnDate, 'Invoice date') ?? todayIso();
  const dueDate = optIsoDate(raw.dueDate, 'Due date');
  dateNotBefore(dueDate, txnDate, 'The due date', 'the invoice date');
  const email = optEmail(raw.email, 'Billing email');

  const db = getDb();
  return db.transaction(async (tx) => {
    await requireCustomer(tx, customerId);
    await requireProducts(tx, lines.map((l) => l.itemId));
    const docNumber = await nextDocNumber(tx, 'invoice', 'INV');
    const [row] = await tx
      .insert(invoices)
      .values({ docNumber, customerId, txnDate, dueDate: dueDate ?? null, billEmail: email ?? null })
      .returning();
    await tx.insert(invoiceLines).values(toLineInsertRows(lines).map((line) => ({ ...line, invoiceId: row.id })));
    const [invoice] = await attachDetails([row], tx);
    return invoice;
  });
}

// ---------------------------------------------------------------------------
// Milestone/progress invoicing — one contract value split into several
// invoices by percentage (e.g. "50% deposit", "50% on completion"), created
// together and linked by a shared milestoneGroupId. Each is an ordinary
// invoice afterward — edit, send, remind, and pay it exactly like any other.
// ---------------------------------------------------------------------------

export interface MilestoneInput {
  label: string;
  /** 0-100; every milestone's percent across the plan must add up to 100. */
  percent: number;
  dueDate?: string;
}

export interface CreateMilestonePlanInput {
  customerId: string;
  customerName?: string;
  email?: string;
  /** The full contract's line items — each milestone invoice gets these same lines, scaled by its percent. */
  lines: LineItemInput[];
  milestones: MilestoneInput[];
}

/** Takes the row for update, so nothing else can change or pay this invoice while we check and write. */
async function lockInvoice(tx: Tx, id: string): Promise<{ txnDate: string }> {
  const rows = await tx.execute<{ txn_date: string }>(sql`select txn_date from invoices where id = ${id} for update`);
  if (!rows[0]) throw new NotFoundError('Invoice not found.');
  return { txnDate: String(rows[0].txn_date) };
}

export async function createMilestoneInvoicePlan(input: CreateMilestonePlanInput): Promise<Invoice[]> {
  const raw = asRecord(input, 'The plan');
  const customerId = uuid(raw.customerId, 'Customer');
  const lines = parseSalesLines(raw.lines);
  checkedTotal(lines);
  const email = optEmail(raw.email, 'Billing email');
  if (!Array.isArray(raw.milestones) || raw.milestones.length < 2) {
    throw new ValidationError('Add at least two milestones — for a single invoice, use New invoice instead.');
  }
  if (raw.milestones.length > 24) throw new ValidationError('A plan can have at most 24 milestones.');
  const milestones = raw.milestones.map((entry, i) => {
    const m = asRecord(entry, `Milestone ${i + 1}`);
    return {
      label: optText(m.label, `Milestone ${i + 1} label`, 80) ?? `Milestone ${i + 1}`,
      percent: money(m.percent, `Milestone ${i + 1} percent`, { max: 100 }),
      dueDate: optIsoDate(m.dueDate, `Milestone ${i + 1} due date`),
    };
  });
  const totalPercent = roundMoney(milestones.reduce((sum, m) => sum + m.percent, 0));
  if (totalPercent !== 100) {
    throw new ValidationError(`Milestone percentages must add up to exactly 100% (currently ${totalPercent}%).`);
  }

  // Split each line's amount across the milestones to the cent, with any rounding left over going to the last
  // one, so the invoices always add up to exactly the contract total.
  const lineAmounts = lines.map((l) => roundMoney(l.quantity * l.unitPrice));
  const allocation = lineAmounts.map((amount) => {
    const parts: number[] = [];
    let used = 0;
    milestones.forEach((m, i) => {
      const part = i === milestones.length - 1 ? roundMoney(amount - used) : roundMoney((amount * m.percent) / 100);
      used = roundMoney(used + part);
      parts.push(part);
    });
    return parts;
  });

  const db = getDb();
  const groupId = randomUUID();
  return db.transaction(async (tx) => {
    await requireCustomer(tx, customerId);
    await requireProducts(tx, lines.map((l) => l.itemId));
    const base = await nextDocNumber(tx, 'invoice', 'INV');
    const created: Invoice[] = [];
    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      const [row] = await tx
        .insert(invoices)
        .values({
          docNumber: `${base}-M${i + 1}`,
          customerId,
          txnDate: todayIso(),
          dueDate: milestone.dueDate ?? null,
          billEmail: email ?? null,
          milestoneGroupId: groupId,
          milestoneLabel: milestone.label,
        })
        .returning();
      await tx.insert(invoiceLines).values(
        lines.map((line, k) => {
          const amount = allocation[k][i];
          return {
            invoiceId: row.id,
            productId: line.itemId || null,
            description: line.description || null,
            qty: line.quantity.toFixed(4),
            unitPrice: (line.quantity ? amount / line.quantity : amount).toFixed(4),
            amount: amount.toFixed(2),
            lineNumber: k + 1,
          };
        }),
      );
      const [invoice] = await attachDetails([row], tx);
      created.push(invoice);
    }
    return created;
  });
}

export interface UpdateInvoiceInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  dueDate?: string;
  email?: string;
  lines?: LineItemInput[];
  customerId?: string;
  customerName?: string;
}

export async function updateInvoice(input: UpdateInvoiceInput): Promise<Invoice> {
  const raw = asRecord(input, 'The invoice');
  const id = uuid(raw.id, 'Invoice');
  const lines = raw.lines !== undefined ? parseSalesLines(raw.lines) : undefined;
  const newTotal = lines ? checkedTotal(lines) : undefined;
  const dueDate = raw.dueDate !== undefined ? (optIsoDate(raw.dueDate, 'Due date') ?? null) : undefined;
  const email = raw.email !== undefined ? (optEmail(raw.email, 'Billing email') ?? null) : undefined;
  const customerId = raw.customerId !== undefined ? uuid(raw.customerId, 'Customer') : undefined;

  const db = getDb();
  return db.transaction(async (tx) => {
    const { txnDate } = await lockInvoice(tx, id);
    if (dueDate) dateNotBefore(dueDate, txnDate, 'The due date', 'the invoice date');
    if (customerId) await requireCustomer(tx, customerId);
    if (lines) {
      await requireProducts(tx, lines.map((l) => l.itemId));
      const [paid] = await tx
        .select({ total: sql<string>`coalesce(sum(${invoicePayments.amount}), 0)` })
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, id));
      const alreadyPaid = roundMoney(Number(paid?.total ?? 0));
      if (newTotal !== undefined && newTotal < alreadyPaid) {
        throw new ConflictError(
          `${formatCurrency(alreadyPaid)} has already been paid on this invoice, which is more than the new total of ${formatCurrency(newTotal)}. Remove or adjust the payment first.`,
        );
      }
    }

    const patch: Partial<InvoiceRow> = { updatedAt: new Date() };
    if (dueDate !== undefined) patch.dueDate = dueDate;
    if (email !== undefined) patch.billEmail = email;
    if (customerId !== undefined) patch.customerId = customerId;

    const [row] = await tx.update(invoices).set(patch).where(eq(invoices.id, id)).returning();
    if (!row) throw new NotFoundError('Invoice not found.');

    if (lines) {
      await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
      await tx.insert(invoiceLines).values(toLineInsertRows(lines).map((line) => ({ ...line, invoiceId: row.id })));
    }
    const [invoice] = await attachDetails([row], tx);
    return invoice;
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  uuid(id, 'Invoice');
  const db = getDb();
  await db.transaction(async (tx) => {
    await lockInvoice(tx, id);
    const existingPayments = await tx
      .select({ id: invoicePayments.id })
      .from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, id));
    if (existingPayments.length > 0) {
      throw new ConflictError('This invoice has a payment recorded against it — remove the payment first.');
    }
    // invoice_lines cascade-deletes via its ON DELETE CASCADE foreign key.
    await tx.delete(invoices).where(eq(invoices.id, id));
  });
}

export async function duplicateInvoice(id: string): Promise<Invoice> {
  uuid(id, 'Invoice');
  const db = getDb();
  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(invoices).where(eq(invoices.id, id));
    if (!original) throw new NotFoundError('Invoice not found.');
    const originalLines = await tx.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    const docNumber = await nextDocNumber(tx, 'invoice', 'INV');
    const [row] = await tx
      .insert(invoices)
      .values({
        docNumber,
        customerId: original.customerId,
        txnDate: todayIso(),
        dueDate: original.dueDate,
        billEmail: original.billEmail,
      })
      .returning();
    if (originalLines.length > 0) {
      await tx.insert(invoiceLines).values(
        originalLines
          .sort((a, b) => a.lineNumber - b.lineNumber)
          .map((line, index) => ({
            invoiceId: row.id,
            productId: line.productId,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            amount: line.amount,
            lineNumber: index + 1,
          })),
      );
    }
    const [invoice] = await attachDetails([row], tx);
    return invoice;
  });
}

function invoiceEmailBody(invoice: Invoice, kind: 'invoice' | 'reminder'): { subject: string; text: string; html: string } {
  const lineRows = invoice.Line.map(
    (l) => `${l.SalesItemLineDetail.ItemRef.name ?? l.Description ?? 'Item'} — ${l.SalesItemLineDetail.Qty} x ${formatCurrency(l.SalesItemLineDetail.UnitPrice)} = ${formatCurrency(l.Amount)}`,
  );
  const heading = kind === 'reminder' ? `Payment reminder: Invoice ${invoice.DocNumber}` : `Invoice ${invoice.DocNumber}`;
  const subject = heading;
  const text = [
    heading,
    `Date: ${formatDate(invoice.TxnDate)}`,
    invoice.DueDate ? `Due: ${formatDate(invoice.DueDate)}` : null,
    '',
    ...lineRows,
    '',
    `Total: ${formatCurrency(invoice.TotalAmt)}`,
    `Balance due: ${formatCurrency(invoice.Balance)}`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
  const html = `<h2>${escapeHtml(heading)}</h2>
<p>Date: ${formatDate(invoice.TxnDate)}${invoice.DueDate ? ` &middot; Due: ${formatDate(invoice.DueDate)}` : ''}</p>
<ul>${lineRows.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
<p><strong>Total: ${formatCurrency(invoice.TotalAmt)}</strong></p>
<p><strong>Balance due: ${formatCurrency(invoice.Balance)}</strong></p>`;
  return { subject, text, html };
}

/** Emails the invoice to the given address (or the customer's address on file if omitted). */
export async function sendInvoice(id: string, email?: string): Promise<Invoice> {
  const invoice = await getInvoice(id);
  const to = optEmail(email, 'Email') ?? invoice.BillEmail?.Address;
  if (!to) throw new ValidationError('No email address on file for this customer — add one first.');
  const { subject, text, html } = invoiceEmailBody(invoice, 'invoice');
  await sendMail({ to, subject, text, html });
  return invoice;
}

/** There's no separate "reminder" concept here either — it's the same email, framed as a nudge. */
export async function sendInvoiceReminder(id: string, email?: string): Promise<Invoice> {
  const invoice = await getInvoice(id);
  const to = optEmail(email, 'Email') ?? invoice.BillEmail?.Address;
  if (!to) throw new ValidationError('No email address on file for this customer — add one first.');
  const { subject, text, html } = invoiceEmailBody(invoice, 'reminder');
  await sendMail({ to, subject, text, html });
  const db = getDb();
  await db.update(invoices).set({ lastReminderSentAt: new Date() }).where(eq(invoices.id, id));
  return getInvoice(id);
}

// ---------------------------------------------------------------------------
// Invoice payments — QuickBooks tracked balance/payments-applied for us;
// standalone, this app owns that now.
// ---------------------------------------------------------------------------

export interface InvoicePayment {
  Id: string;
  Amount: number;
  PaymentDate: string;
  DepositAccountRef: { value: string; name?: string };
  Memo?: string;
}

export async function listInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  uuid(invoiceId, 'Invoice');
  const db = getDb();
  const rows = await db
    .select({
      id: invoicePayments.id,
      amount: invoicePayments.amount,
      paymentDate: invoicePayments.paymentDate,
      depositAccountId: invoicePayments.depositAccountId,
      accountName: accounts.name,
      memo: invoicePayments.memo,
    })
    .from(invoicePayments)
    .innerJoin(accounts, eq(invoicePayments.depositAccountId, accounts.id))
    .where(eq(invoicePayments.invoiceId, invoiceId))
    .orderBy(desc(invoicePayments.paymentDate));
  return rows.map((row) => ({
    Id: row.id,
    Amount: Number(row.amount),
    PaymentDate: row.paymentDate,
    DepositAccountRef: { value: row.depositAccountId, name: row.accountName },
    Memo: row.memo ?? undefined,
  }));
}

export interface RecordInvoicePaymentInput {
  invoiceId: string;
  amount: number;
  paymentDate?: string;
  depositAccountId: string;
  memo?: string;
}

/** A payment can be dated today or in the past. One day of leeway covers a clock or time zone a day ahead of the server. */
export function assertNotFuture(date: string, field: string): void {
  const limit = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (date > limit) throw new ValidationError(`${field} can't be in the future.`);
}

export async function recordInvoicePayment(input: RecordInvoicePaymentInput): Promise<InvoicePayment> {
  const raw = asRecord(input, 'The payment');
  const invoiceId = uuid(raw.invoiceId, 'Invoice');
  const amount = money(raw.amount, 'Payment amount');
  const paymentDate = optIsoDate(raw.paymentDate, 'Payment date') ?? todayIso();
  assertNotFuture(paymentDate, 'The payment date');
  const depositAccountId = uuid(raw.depositAccountId, 'Deposit account');
  const memo = optText(raw.memo, 'Memo', 200);

  const db = getDb();
  return db.transaction(async (tx) => {
    // Lock the invoice, then read its balance: two payments arriving together are handled one after the other,
    // so the second sees the first and cannot push the invoice below zero.
    await lockInvoice(tx, invoiceId);
    await requireAccount(tx, depositAccountId, 'The deposit account', BANK_ACCOUNT_TYPES);
    const [lineTotal] = await tx
      .select({ total: sql<string>`coalesce(sum(${invoiceLines.amount}), 0)` })
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, invoiceId));
    const [paidTotal] = await tx
      .select({ total: sql<string>`coalesce(sum(${invoicePayments.amount}), 0)` })
      .from(invoicePayments)
      .where(eq(invoicePayments.invoiceId, invoiceId));
    const balance = roundMoney(Number(lineTotal?.total ?? 0) - Number(paidTotal?.total ?? 0));
    if (amount > balance + 0.004) {
      throw new ConflictError(`Payment can't exceed the balance due (${formatCurrency(balance)}).`);
    }
    const [account] = await tx.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, depositAccountId));
    const [row] = await tx
      .insert(invoicePayments)
      .values({ invoiceId, amount: amount.toFixed(2), paymentDate, depositAccountId, memo: memo ?? null })
      .returning();
    return {
      Id: row.id,
      Amount: Number(row.amount),
      PaymentDate: row.paymentDate,
      DepositAccountRef: { value: row.depositAccountId, name: account?.name },
      Memo: row.memo ?? undefined,
    };
  });
}

export async function deleteInvoicePayment(invoiceId: string, paymentId: string): Promise<void> {
  uuid(invoiceId, 'Invoice');
  uuid(paymentId, 'Payment');
  const db = getDb();
  // Match the invoice in the same statement, so a payment that belongs to a different invoice is left alone.
  const deleted = await db
    .delete(invoicePayments)
    .where(and(eq(invoicePayments.id, paymentId), eq(invoicePayments.invoiceId, invoiceId)))
    .returning({ id: invoicePayments.id });
  if (deleted.length === 0) throw new NotFoundError('Payment not found.');
}

export type { GlAccount as DepositAccount } from '@/lib/accounting/chartOfAccounts';
/** Lists Bank accounts (from this app's own Chart of Accounts) so "record a payment" can ask which account the money landed in. */
export { listBankAccounts as listDepositAccounts } from '@/lib/accounting/chartOfAccounts';
