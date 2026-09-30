import { randomUUID } from 'crypto';
import { getDb } from '@/db/client';
import { invoices, invoiceLines, invoicePayments, customers, products, accounts } from '@/db/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import { sendMail } from '@/lib/email/mailer';
import { formatCurrency, formatDate } from '@/lib/format';
import { toLineInsertRows, rowsToSalesDocLines, type LineItemInput, type LineRow } from '@/lib/accounting/salesLines';
import type { SalesDocLine } from '@/lib/quickbooks/salesTypes';

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

async function nextDocNumber(prefix: string): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(invoices);
  return `${prefix}-${String((row?.count ?? 0) + 1).padStart(4, '0')}`;
}

async function attachDetails(rows: InvoiceRow[]): Promise<Invoice[]> {
  if (rows.length === 0) return [];
  const db = getDb();
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

export async function getInvoice(id: string): Promise<Invoice> {
  const db = getDb();
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!row) throw new Error('Invoice not found.');
  const [invoice] = await attachDetails([row]);
  return invoice;
}

function validateLines(lines: LineItemInput[]): void {
  if (lines.length === 0) throw new Error('Add at least one line item.');
  if (lines.some((l) => !l.itemId)) throw new Error('Every line needs a product/service selected.');
}

export interface CreateInvoiceInput {
  customerId: string;
  customerName?: string;
  email?: string;
  txnDate?: string;
  dueDate?: string;
  lines: LineItemInput[];
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  validateLines(input.lines);
  const db = getDb();
  const docNumber = await nextDocNumber('INV');
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(invoices)
      .values({
        docNumber,
        customerId: input.customerId,
        txnDate: input.txnDate || new Date().toISOString().slice(0, 10),
        dueDate: input.dueDate || null,
        billEmail: input.email || null,
      })
      .returning();
    await tx
      .insert(invoiceLines)
      .values(toLineInsertRows(input.lines).map((line) => ({ ...line, invoiceId: row.id })));
    const [invoice] = await attachDetails([row]);
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

export async function createMilestoneInvoicePlan(input: CreateMilestonePlanInput): Promise<Invoice[]> {
  validateLines(input.lines);
  if (input.milestones.length < 2) {
    throw new Error('Add at least two milestones — for a single invoice, use New invoice instead.');
  }
  const totalPercent = round2(input.milestones.reduce((sum, m) => sum + m.percent, 0));
  if (Math.abs(totalPercent - 100) > 0.5) {
    throw new Error(`Milestone percentages must add up to 100% (currently ${totalPercent}%).`);
  }

  const db = getDb();
  const baseDocNumber = await nextDocNumber('INV');
  const groupId = randomUUID();

  return db.transaction(async (tx) => {
    const created: Invoice[] = [];
    for (let i = 0; i < input.milestones.length; i++) {
      const milestone = input.milestones[i];
      const scaledLines: LineItemInput[] = input.lines.map((line) => ({
        ...line,
        unitPrice: round2(line.unitPrice * (milestone.percent / 100)),
      }));
      const [row] = await tx
        .insert(invoices)
        .values({
          docNumber: `${baseDocNumber}-M${i + 1}`,
          customerId: input.customerId,
          txnDate: new Date().toISOString().slice(0, 10),
          dueDate: milestone.dueDate || null,
          billEmail: input.email || null,
          milestoneGroupId: groupId,
          milestoneLabel: milestone.label,
        })
        .returning();
      await tx.insert(invoiceLines).values(toLineInsertRows(scaledLines).map((line) => ({ ...line, invoiceId: row.id })));
      const [invoice] = await attachDetails([row]);
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
  if (input.lines) validateLines(input.lines);
  const db = getDb();
  return db.transaction(async (tx) => {
    const patch: Partial<InvoiceRow> = { updatedAt: new Date() };
    if (input.dueDate !== undefined) patch.dueDate = input.dueDate || null;
    if (input.email !== undefined) patch.billEmail = input.email || null;
    if (input.customerId !== undefined) patch.customerId = input.customerId;

    const [row] = await tx.update(invoices).set(patch).where(eq(invoices.id, input.id)).returning();
    if (!row) throw new Error('Invoice not found.');

    if (input.lines) {
      await tx.delete(invoiceLines).where(eq(invoiceLines.invoiceId, input.id));
      await tx.insert(invoiceLines).values(toLineInsertRows(input.lines).map((line) => ({ ...line, invoiceId: row.id })));
    }
    const [invoice] = await attachDetails([row]);
    return invoice;
  });
}

export async function deleteInvoice(id: string): Promise<void> {
  const db = getDb();
  const existingPayments = await db
    .select({ id: invoicePayments.id })
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, id));
  if (existingPayments.length > 0) {
    throw new Error('This invoice has a payment recorded against it — remove the payment first.');
  }
  // invoice_lines cascade-deletes via its ON DELETE CASCADE foreign key.
  const deleted = await db.delete(invoices).where(eq(invoices.id, id)).returning({ id: invoices.id });
  if (deleted.length === 0) throw new Error('Invoice not found.');
}

export async function duplicateInvoice(id: string): Promise<Invoice> {
  const db = getDb();
  const [original] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!original) throw new Error('Invoice not found.');
  const originalLines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id));
  const docNumber = await nextDocNumber('INV');

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(invoices)
      .values({
        docNumber,
        customerId: original.customerId,
        txnDate: new Date().toISOString().slice(0, 10),
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
    const [invoice] = await attachDetails([row]);
    return invoice;
  });
}

function invoiceEmailBody(invoice: Invoice, kind: 'invoice' | 'reminder'): { subject: string; text: string; html: string } {
  const lineRows = invoice.Line.map(
    (l) => `${l.SalesItemLineDetail.ItemRef.name ?? 'Item'} — ${l.SalesItemLineDetail.Qty} x ${formatCurrency(l.SalesItemLineDetail.UnitPrice)} = ${formatCurrency(l.Amount)}`,
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
  const html = `<h2>${heading}</h2>
<p>Date: ${formatDate(invoice.TxnDate)}${invoice.DueDate ? ` &middot; Due: ${formatDate(invoice.DueDate)}` : ''}</p>
<ul>${lineRows.map((l) => `<li>${l}</li>`).join('')}</ul>
<p><strong>Total: ${formatCurrency(invoice.TotalAmt)}</strong></p>
<p><strong>Balance due: ${formatCurrency(invoice.Balance)}</strong></p>`;
  return { subject, text, html };
}

/** Emails the invoice to the given address (or the customer's address on file if omitted). */
export async function sendInvoice(id: string, email?: string): Promise<Invoice> {
  const invoice = await getInvoice(id);
  const to = email || invoice.BillEmail?.Address;
  if (!to) throw new Error('No email address on file for this customer — add one first.');
  const { subject, text, html } = invoiceEmailBody(invoice, 'invoice');
  await sendMail({ to, subject, text, html });
  return invoice;
}

/** There's no separate "reminder" concept here either — it's the same email, framed as a nudge. */
export async function sendInvoiceReminder(id: string, email?: string): Promise<Invoice> {
  const invoice = await getInvoice(id);
  const to = email || invoice.BillEmail?.Address;
  if (!to) throw new Error('No email address on file for this customer — add one first.');
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

export async function recordInvoicePayment(input: RecordInvoicePaymentInput): Promise<InvoicePayment> {
  if (input.amount <= 0) throw new Error('Payment amount must be greater than zero.');
  const invoice = await getInvoice(input.invoiceId);
  if (input.amount > invoice.Balance + 0.005) {
    throw new Error(`Payment can't exceed the balance due (${formatCurrency(invoice.Balance)}).`);
  }
  const db = getDb();
  const [account] = await db.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, input.depositAccountId));
  const [row] = await db
    .insert(invoicePayments)
    .values({
      invoiceId: input.invoiceId,
      amount: input.amount.toFixed(2),
      paymentDate: input.paymentDate || new Date().toISOString().slice(0, 10),
      depositAccountId: input.depositAccountId,
      memo: input.memo || null,
    })
    .returning();
  return {
    Id: row.id,
    Amount: Number(row.amount),
    PaymentDate: row.paymentDate,
    DepositAccountRef: { value: row.depositAccountId, name: account?.name },
    Memo: row.memo ?? undefined,
  };
}

export async function deleteInvoicePayment(invoiceId: string, paymentId: string): Promise<void> {
  const db = getDb();
  const deleted = await db
    .delete(invoicePayments)
    .where(eq(invoicePayments.id, paymentId))
    .returning({ id: invoicePayments.id, invoiceId: invoicePayments.invoiceId });
  if (deleted.length === 0 || deleted[0].invoiceId !== invoiceId) throw new Error('Payment not found.');
}

export type { GlAccount as DepositAccount } from '@/lib/accounting/chartOfAccounts';
/** Lists Bank accounts (from this app's own Chart of Accounts) so "record a payment" can ask which account the money landed in. */
export { listBankAccounts as listDepositAccounts } from '@/lib/accounting/chartOfAccounts';
