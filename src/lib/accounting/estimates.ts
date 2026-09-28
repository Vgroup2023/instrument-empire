import { getDb } from '@/db/client';
import { estimates, estimateLines, customers, products } from '@/db/schema';
import { eq, inArray, desc, sql } from 'drizzle-orm';
import { sendMail } from '@/lib/email/mailer';
import { formatCurrency, formatDate } from '@/lib/format';
import { toLineInsertRows, rowsToSalesDocLines, type LineItemInput, type LineRow } from '@/lib/accounting/salesLines';
import type { SalesDocLine } from '@/lib/quickbooks/salesTypes';

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

async function nextDocNumber(prefix: string): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ count: sql<number>`cast(count(*) as int)` }).from(estimates);
  return `${prefix}-${String((row?.count ?? 0) + 1).padStart(4, '0')}`;
}

async function attachDetails(rows: EstimateRow[]): Promise<Estimate[]> {
  if (rows.length === 0) return [];
  const db = getDb();
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

export async function getEstimate(id: string): Promise<Estimate> {
  const db = getDb();
  const [row] = await db.select().from(estimates).where(eq(estimates.id, id));
  if (!row) throw new Error('Estimate not found.');
  const [estimate] = await attachDetails([row]);
  return estimate;
}

function validateLines(lines: LineItemInput[]): void {
  if (lines.length === 0) throw new Error('Add at least one line item.');
  if (lines.some((l) => !l.itemId)) throw new Error('Every line needs a product/service selected.');
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
  validateLines(input.lines);
  const db = getDb();
  const docNumber = await nextDocNumber('EST');
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(estimates)
      .values({
        docNumber,
        customerId: input.customerId,
        txnDate: input.txnDate || new Date().toISOString().slice(0, 10),
        expirationDate: input.expirationDate || null,
        billEmail: input.email || null,
      })
      .returning();
    await tx
      .insert(estimateLines)
      .values(toLineInsertRows(input.lines).map((line) => ({ ...line, estimateId: row.id })));
    const [estimate] = await attachDetails([row]);
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
  if (input.lines) validateLines(input.lines);
  const db = getDb();
  return db.transaction(async (tx) => {
    const patch: Partial<EstimateRow> = { updatedAt: new Date() };
    if (input.expirationDate !== undefined) patch.expirationDate = input.expirationDate || null;
    if (input.email !== undefined) patch.billEmail = input.email || null;

    const [row] = await tx.update(estimates).set(patch).where(eq(estimates.id, input.id)).returning();
    if (!row) throw new Error('Estimate not found.');

    if (input.lines) {
      await tx.delete(estimateLines).where(eq(estimateLines.estimateId, input.id));
      await tx.insert(estimateLines).values(toLineInsertRows(input.lines).map((line) => ({ ...line, estimateId: row.id })));
    }
    const [estimate] = await attachDetails([row]);
    return estimate;
  });
}

export async function deleteEstimate(id: string): Promise<void> {
  const db = getDb();
  // estimate_lines cascade-deletes via its ON DELETE CASCADE foreign key.
  const deleted = await db.delete(estimates).where(eq(estimates.id, id)).returning({ id: estimates.id });
  if (deleted.length === 0) throw new Error('Estimate not found.');
}

export async function duplicateEstimate(id: string): Promise<Estimate> {
  const db = getDb();
  const [original] = await db.select().from(estimates).where(eq(estimates.id, id));
  if (!original) throw new Error('Estimate not found.');
  const originalLines = await db.select().from(estimateLines).where(eq(estimateLines.estimateId, id));
  const docNumber = await nextDocNumber('EST');

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(estimates)
      .values({
        docNumber,
        customerId: original.customerId,
        txnDate: new Date().toISOString().slice(0, 10),
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
    const [estimate] = await attachDetails([row]);
    return estimate;
  });
}

export async function sendEstimate(id: string, email?: string): Promise<Estimate> {
  const estimate = await getEstimate(id);
  const to = email || estimate.BillEmail?.Address;
  if (!to) throw new Error('No email address on file for this customer — add one first.');
  const lineRows = estimate.Line.map(
    (l) => `${l.SalesItemLineDetail.ItemRef.name ?? 'Item'} — ${l.SalesItemLineDetail.Qty} x ${formatCurrency(l.SalesItemLineDetail.UnitPrice)} = ${formatCurrency(l.Amount)}`,
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
  const html = `<h2>${subject}</h2>
<p>Date: ${formatDate(estimate.TxnDate)}${estimate.ExpirationDate ? ` &middot; Expires: ${formatDate(estimate.ExpirationDate)}` : ''}</p>
<ul>${lineRows.map((l) => `<li>${l}</li>`).join('')}</ul>
<p><strong>Total: ${formatCurrency(estimate.TotalAmt)}</strong></p>`;
  await sendMail({ to, subject, text, html });
  return estimate;
}
