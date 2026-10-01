import type { LineItemInput, SalesDocLine } from '@/lib/quickbooks/salesTypes';

// Shared line-item math for the local Invoices/Estimates modules — kept
// separate from src/lib/quickbooks/salesTypes.ts's toQboLines() because that
// one builds a QuickBooks API request body, not a database row.

export type { LineItemInput };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lineTotal(items: LineItemInput[]): number {
  return round2(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
}

export interface LineInsertRow {
  productId: string | null;
  description: string | null;
  qty: string;
  unitPrice: string;
  amount: string;
  lineNumber: number;
}

/** Builds insertable line rows from form input, in the shape every sales-line table (invoice_lines, estimate_lines) shares. */
export function toLineInsertRows(items: LineItemInput[]): LineInsertRow[] {
  return items.map((item, index) => ({
    // A custom line (no catalog product) has itemId === '' — that's not a
    // valid uuid, so it must become null rather than being inserted as-is.
    productId: item.itemId || null,
    description: item.description || null,
    qty: item.quantity.toFixed(4),
    unitPrice: item.unitPrice.toFixed(4),
    amount: round2(item.quantity * item.unitPrice).toFixed(2),
    lineNumber: index + 1,
  }));
}

export interface LineRow {
  productId: string | null;
  description: string | null;
  qty: string;
  unitPrice: string;
  amount: string;
  lineNumber: number;
}

/** Converts stored line rows back into the QuickBooks-shaped SalesDocLine[] the existing UI already knows how to render. */
export function rowsToSalesDocLines(rows: LineRow[], productNameById: Map<string, string>): SalesDocLine[] {
  return [...rows]
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((row) => ({
      DetailType: 'SalesItemLineDetail',
      Amount: Number(row.amount),
      Description: row.description ?? undefined,
      SalesItemLineDetail: {
        ItemRef: { value: row.productId ?? '', name: row.productId ? productNameById.get(row.productId) : undefined },
        Qty: Number(row.qty),
        UnitPrice: Number(row.unitPrice),
      },
    }));
}
