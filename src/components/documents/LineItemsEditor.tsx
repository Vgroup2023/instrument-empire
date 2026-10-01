'use client';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { formatCurrency } from '@/lib/format';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import type { Product } from '@/lib/quickbooks/items';

const BLANK_LINE: LineItemInput = { itemId: '', quantity: 1, unitPrice: 0 };

export function blankLines(count: number): LineItemInput[] {
  return Array.from({ length: count }, () => ({ ...BLANK_LINE }));
}

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
    onChange([...lines, { ...BLANK_LINE }]);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  return (
    <div className="space-y-3">
      <p className="px-1 text-xs text-slate-400">
        Pick a product/service, or leave it unset and add a description below for a one-off custom line.
      </p>
      <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
        <div className="col-span-5">Product / service</div>
        <div className="col-span-2">Qty</div>
        <div className="col-span-2">Unit price</div>
        <div className="col-span-2">Amount</div>
      </div>
      {lines.map((line, index) => {
        // Deactivated products/services shouldn't be picked on new lines, but
        // an already-selected one (e.g. editing an older document) must stay visible.
        const selectableProducts = products.filter((p) => p.Active !== false || p.Id === line.itemId);
        return (
        <div key={index} className="space-y-1.5">
          <div className="grid grid-cols-12 items-center gap-2">
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
              >
                <option value="">No product — custom line</option>
                {selectableProducts.map((p) => (
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
            <div className="col-span-3 text-right text-sm font-medium text-slate-700 sm:col-span-2">
              {formatCurrency(line.quantity * line.unitPrice)}
            </div>
            <div className="col-span-1 text-right">
              <button
                type="button"
                onClick={() => removeLine(index)}
                className="text-slate-400 hover:text-red-600"
                aria-label="Remove line"
              >
                ✕
              </button>
            </div>
          </div>
          <Input
            value={line.description ?? ''}
            onChange={(e) => updateLine(index, { description: e.target.value })}
            placeholder={line.itemId ? 'Description (optional)' : 'Description — required for a custom line with no product'}
            className="text-xs"
          />
        </div>
        );
      })}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={addLine}>
          + Add line
        </Button>
        <p className="text-sm font-semibold text-slate-900">Total: {formatCurrency(total)}</p>
      </div>
    </div>
  );
}
