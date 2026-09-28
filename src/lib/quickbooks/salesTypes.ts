export interface LineItemInput {
  itemId: string;
  itemName?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
}

export interface SalesDocLine {
  Id?: string;
  DetailType: 'SalesItemLineDetail';
  Amount: number;
  Description?: string;
  SalesItemLineDetail: {
    ItemRef: { value: string; name?: string };
    Qty: number;
    UnitPrice: number;
  };
}

export function toQboLines(items: LineItemInput[]): SalesDocLine[] {
  return items.map((item) => ({
    DetailType: 'SalesItemLineDetail',
    Amount: round2(item.quantity * item.unitPrice),
    Description: item.description || undefined,
    SalesItemLineDetail: {
      ItemRef: { value: item.itemId, name: item.itemName },
      Qty: item.quantity,
      UnitPrice: item.unitPrice,
    },
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Fields that must never carry over when duplicating an invoice/estimate —
// either because they're server-computed, identify the original document
// specifically, or represent associations (payments, recurring templates)
// that shouldn't attach to a new one. Everything else on the original
// (sales tax, memos, discounts, custom fields, terms, addresses, class,
// currency, etc.) is preserved by default, since dropping any of that
// silently — sales tax especially — would misstate the duplicate.
const DUPLICATE_STRIP_FIELDS = [
  'Id',
  'SyncToken',
  'MetaData',
  'domain',
  'sparse',
  'DocNumber',
  'TxnDate',
  'Balance',
  'BalanceWithJurisdiction',
  'TotalAmt',
  'EmailStatus',
  'DeliveryInfo',
  'InvoiceLink',
  'LinkedTxn',
  'RecurDataRef',
  'PrintStatus',
];

/** Builds a duplicate-ready payload from a fetched invoice/estimate, preserving everything except identity/computed fields. */
export function stripForDuplicate<T extends Record<string, unknown>>(
  original: T,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...original };
  for (const field of DUPLICATE_STRIP_FIELDS) delete copy[field];
  // Line items carry the original document's own Line.Id/LineNum — those
  // belong to that document, not the new one, so a Create call should not
  // echo them back.
  if (Array.isArray(copy.Line)) {
    copy.Line = copy.Line.map((line: Record<string, unknown>) => {
      const { Id, LineNum, ...rest } = line;
      return rest;
    });
  }
  return { ...copy, ...overrides };
}
