'use client';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { formatCurrency } from '@/lib/format';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import type { Product } from '@/lib/quickbooks/items';

export function LineItemsEditor({
  products,
  lines,
  onChange,
}: {
  products: Product[];
  lines: LineItemInput[];
  onChange: (lines: LineItemInput[]) => void;
}) {
  function updateLine(index: number, patch: Partial<LineItemInput>) {
    const next = lines.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addLine() {
    onChange([...lines, { itemId: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-400 sm:grid">
        <div className="col-span-5">Product / service</div>
        <div className="col-span-2">Qty</div>
        <div className="col-span-2">Unit price</div>
        <div className="col-span-2">Amount</div>
      </div>
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-12 items-center gap-2">
          <div className="col-span-12 sm:col-span-5">
            <Select
              value={line.itemId}
              onChange={(e) => {
                const product = products.find((p) => p.Id === e.target.value);
                updateLine(index, {
                  itemId: e.target.value,
                  itemName: product?.Name,
                  unitPrice: product?.UnitPrice ?? line.unitPrice,
                });
              }}
              required
            >
              <option value="">Select a product/service…</option>
              {products.map((p) => (
                <option key={p.Id} value={p.Id}>
                  {p.Name}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-4 sm:col-span-2">
            <Input
              type="number"
              min={0}
              step="1"
              value={line.quantity}
              onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
              required
            />
          </div>
          <div className="col-span-4 sm:col-span-2">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={line.unitPrice}
              onChange={(e) => updateLine(index, { unitPrice: Number(e.target.value) })}
              required
            />
          </div>
          <div className="col-span-3 text-right text-sm font-medium text-slate-200 sm:col-span-2">
            {formatCurrency(line.quantity * line.unitPrice)}
          </div>
          <div className="col-span-1 text-right">
            <button
              type="button"
              onClick={() => removeLine(index)}
              className="text-slate-500 hover:text-red-400"
              aria-label="Remove line"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={addLine}>
          + Add line
        </Button>
        <p className="text-sm font-semibold text-slate-50">Total: {formatCurrency(total)}</p>
      </div>
    </div>
  );
}
