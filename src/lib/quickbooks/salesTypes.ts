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
