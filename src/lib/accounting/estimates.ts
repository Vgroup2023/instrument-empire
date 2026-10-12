import { getDb } from '@/db/client';
import type { Page } from '@/lib/paging';
import { estimates, estimateLines, customers, products } from '@/db/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import { sendMail } from '@/lib/email/mailer';
import { formatCurrency, formatDate } from '@/lib/format';
import { toLineInsertRows, rowsToSalesDocLines, type LineItemInput, type LineRow } from '@/lib/accounting/salesLines';
import type { SalesDocLine } from '@/lib/quickbooks/salesTypes';
import {
  MAX_MONEY,
  NotFoundError,
  ValidationError,
  asRecord,
  dateNotBefore,
  optEmail,
  optIsoDate,
  round2 as roundMoney,
  todayIso,
  uuid,
} from '@/lib/validation';
import { requireCustomer, requireProducts, parseSalesLines, type Executor } from '@/lib/accounting/entryRules';
import { nextDocNumber } from '@/lib/accounting/docNumbers';
import { escapeHtml } from '@/lib/html';

// This is the standalone, database-backed Estimates ledger — the app's own
// source of truth, not QuickBooks. See src/lib/quickbooks/estimates.ts for
// the (optional, separate) QuickBooks-backed equivalent. Recurring schedules
// (src/lib/accounting/recurring.ts) create their documents through this
// module too.

export interface Estimate {
  Id: string;
  /** Kept for UI compatibility with the QuickBooks-backed pages — not a real optimistic-concurrency token here. */
  SyncToken: string;
  DocNumber?: string;
  TxnDate: string;
  ExpirationDate?: string;
  CustomerRef: { value: string; name?: string };
  BillEmail?: { Address: string };
  Line: SalesDocLine[];
  TotalAmt: number;
  TxnStatus?: string;
}

type EstimateRow = typeof estimates.$inferSelect;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Pass the open transaction as `ex` when reading back something just written inside it (see invoices.ts).
async function attachDetails(rows: EstimateRow[], ex: Executor = getDb()): Promise<Estimate[]> {
  if (rows.length === 0) return [];
  const db = ex;
  const ids = rows.map((r) => r.id);
  const customerIds = [...new Set(rows.map((r) => r.customerId))];

  const [lineRows, customerRows] = await Promise.all([
    db.select().from(estimateLines).where(inArray(estimateLines.estimateId, ids)),
    db.select({ id: customers.id, displayName: customers.displayName }).from(customers).where(inArray(customers.id, customerIds)),
  ]);

  const productIds = [...new Set(lineRows.map((l) => l.productId).filter((id): id is string => Boolean(id)))];
  const productRows = productIds.length
    ? await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds))
    : [];
  const productNameById = new Map(productRows.map((p) => [p.id, p.name]));
  const customerNameById = new Map(customerRows.map((c) => [c.id, c.displayName]));

  const linesByEstimate = new Map<string, LineRow[]>();
  for (const line of lineRows) {
    const list = linesByEstimate.get(line.estimateId) ?? [];
    list.push(line);
    linesByEstimate.set(line.estimateId, list);
  }

  return rows.map((row) => {
    const salesLines = rowsToSalesDocLines(linesByEstimate.get(row.id) ?? [], productNameById);
    return {
      Id: row.id,
      SyncToken: row.updatedAt.getTime().toString(),
      DocNumber: row.docNumber ?? undefined,
      TxnDate: row.txnDate,
      ExpirationDate: row.expirationDate ?? undefined,
      CustomerRef: { value: row.customerId, name: customerNameById.get(row.customerId) },
      BillEmail: row.billEmail ? { Address: row.billEmail } : undefined,
      Line: salesLines,
      TotalAmt: round2(salesLines.reduce((sum, l) => sum + l.Amount, 0)),
      TxnStatus: row.status,
    };
  });
}

export async function listEstimates(): Promise<Estimate[]> {
  const db = getDb();
  const rows = await db.select().from(estimates).orderBy(desc(estimates.txnDate), desc(estimates.createdAt));
  return attachDetails(rows);
}

/** The newest `limit` rows after skipping `offset`, plus the overall count, so a tab can open fast and load more on request. */
export async function listEstimatesPage(limit: number, offset: number): Promise<Page<Estimate>> {
  const db = getDb();
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(estimates).orderBy(desc(estimates.txnDate), desc(estimates.createdAt)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(estimates),
  ]);
  return { items: await attachDetails(rows), total: n };
}

export async function getEstimate(id: string, ex: Executor = getDb()): Promise<Estimate> {
  uuid(id, 'Estimate');
  const [row] = await ex.select().from(estimates).where(eq(estimates.id, id));
  if (!row) throw new NotFoundError('Estimate not found.');
  const [estimate] = await attachDetails([row], ex);
  return estimate;
}

function checkedTotal(lines: LineItemInput[]): void {
  const total = roundMoney(lines.reduce((sum, l) => sum + roundMoney(l.quantity * l.unitPrice), 0));
  if (total > MAX_MONEY) throw new ValidationError('The estimate total is too large.');
}

export interface CreateEstimateInput {
  customerId: string;
  customerName?: string;
  email?: string;
  txnDate?: string;
  expirationDate?: string;
  lines: LineItemInput[];
}

export async function createEstimate(input: CreateEstimateInput): Promise<Estimate> {
  const raw = asRecord(input, 'The estimate');
  const customerId = uuid(raw.customerId, 'Customer');
  const lines = parseSalesLines(raw.lines);
  checkedTotal(lines);
  const txnDate = optIsoDate(raw.txnDate, 'Estimate date') ?? todayIso();
  const expirationDate = optIsoDate(raw.expirationDate, 'Expiration date');
  dateNotBefore(expirationDate, txnDate, 'The expiration date', 'the estimate date');
  const email = optEmail(raw.email, 'Billing email');

  const db = getDb();
  return db.transaction(async (tx) => {
    await requireCustomer(tx, customerId);
    await requireProducts(tx, lines.map((l) => l.itemId));
    const docNumber = await nextDocNumber(tx, 'estimate', 'EST');
    const [row] = await tx
      .insert(estimates)
      .values({ docNumber, customerId, txnDate, expirationDate: expirationDate ?? null, billEmail: email ?? null })
      .returning();
    await tx.insert(estimateLines).values(toLineInsertRows(lines).map((line) => ({ ...line, estimateId: row.id })));
    const [estimate] = await attachDetails([row], tx);
    return estimate;
  });
}

export interface UpdateEstimateInput {
  id: string;
  /** Accepted for call-site compatibility with the QuickBooks-backed version; unused here. */
  syncToken?: string;
  expirationDate?: string;
  email?: string;
  lines?: LineItemInput[];
}

export async function updateEstimate(input: UpdateEstimateInput): Promise<Estimate> {
  const raw = asRecord(input, 'The estimate');
  const id = uuid(raw.id, 'Estimate');
  const lines = raw.lines !== undefined ? parseSalesLines(raw.lines) : undefined;
  if (lines) checkedTotal(lines);
  const expirationDate = raw.expirationDate !== undefined ? (optIsoDate(raw.expirationDate, 'Expiration date') ?? null) : undefined;
  const email = raw.email !== undefined ? (optEmail(raw.email, 'Billing email') ?? null) : undefined;

  const db = getDb();
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ txnDate: estimates.txnDate }).from(estimates).where(eq(estimates.id, id));
    if (!current) throw new NotFoundError('Estimate not found.');
    if (expirationDate) dateNotBefore(expirationDate, current.txnDate, 'The expiration date', 'the estimate date');
    if (lines) await requireProducts(tx, lines.map((l) => l.itemId));
    const patch: Partial<EstimateRow> = { updatedAt: new Date() };
    if (expirationDate !== undefined) patch.expirationDate = expirationDate;
    if (email !== undefined) patch.billEmail = email;

    const [row] = await tx.update(estimates).set(patch).where(eq(estimates.id, id)).returning();
    if (!row) throw new NotFoundError('Estimate not found.');
    if (lines) {
      await tx.delete(estimateLines).where(eq(estimateLines.estimateId, id));
      await tx.insert(estimateLines).values(toLineInsertRows(lines).map((line) => ({ ...line, estimateId: row.id })));
    }
    const [estimate] = await attachDetails([row], tx);
    return estimate;
  });
}

export async function deleteEstimate(id: string): Promise<void> {
  uuid(id, 'Estimate');
  const db = getDb();
  // estimate_lines cascade-deletes via its ON DELETE CASCADE foreign key.
  const deleted = await db.delete(estimates).where(eq(estimates.id, id)).returning({ id: estimates.id });
  if (deleted.length === 0) throw new NotFoundError('Estimate not found.');
}

export async function duplicateEstimate(id: string): Promise<Estimate> {
  uuid(id, 'Estimate');
  const db = getDb();
  return db.transaction(async (tx) => {
    const [original] = await tx.select().from(estimates).where(eq(estimates.id, id));
    if (!original) throw new NotFoundError('Estimate not found.');
    const originalLines = await tx.select().from(estimateLines).where(eq(estimateLines.estimateId, id));
    const docNumber = await nextDocNumber(tx, 'estimate', 'EST');
    const [row] = await tx
      .insert(estimates)
      .values({
        docNumber,
        customerId: original.customerId,
        txnDate: todayIso(),
        expirationDate: original.expirationDate,
        billEmail: original.billEmail,
      })
      .returning();
    if (originalLines.length > 0) {
      await tx.insert(estimateLines).values(
        originalLines
          .sort((a, b) => a.lineNumber - b.lineNumber)
          .map((line, index) => ({
            estimateId: row.id,
            productId: line.productId,
            description: line.description,
            qty: line.qty,
            unitPrice: line.unitPrice,
            amount: line.amount,
            lineNumber: index + 1,
          })),
      );
    }
    const [estimate] = await attachDetails([row], tx);
    return estimate;
  });
}

export async function sendEstimate(id: string, email?: string): Promise<Estimate> {
  const estimate = await getEstimate(id);
  const to = optEmail(email, 'Email') ?? estimate.BillEmail?.Address;
  if (!to) throw new ValidationError('No email address on file for this customer — add one first.');
  const lineRows = estimate.Line.map(
    (l) => `${l.SalesItemLineDetail.ItemRef.name ?? l.Description ?? 'Item'} — ${l.SalesItemLineDetail.Qty} x ${formatCurrency(l.SalesItemLineDetail.UnitPrice)} = ${formatCurrency(l.Amount)}`,
  );
  const subject = `Estimate ${estimate.DocNumber}`;
  const text = [
    subject,
    `Date: ${formatDate(estimate.TxnDate)}`,
    estimate.ExpirationDate ? `Expires: ${formatDate(estimate.ExpirationDate)}` : null,
    '',
    ...lineRows,
    '',
    `Total: ${formatCurrency(estimate.TotalAmt)}`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
  const html = `<h2>${escapeHtml(subject)}</h2>
<p>Date: ${formatDate(estimate.TxnDate)}${estimate.ExpirationDate ? ` &middot; Expires: ${formatDate(estimate.ExpirationDate)}` : ''}</p>
<ul>${lineRows.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
<p><strong>Total: ${formatCurrency(estimate.TotalAmt)}</strong></p>`;
  await sendMail({ to, subject, text, html });
  return estimate;
}
