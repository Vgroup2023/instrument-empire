'use client';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { formatCurrency } from '@/lib/format';
import type { ExpenseLineInput } from '@/lib/quickbooks/bills';
import type { GlAccount } from '@/lib/quickbooks/accounts';

export function BillLineItemsEditor({
  expenseAccounts,
  lines,
  onChange,
}: {
  expenseAccounts: GlAccount[];
  lines: ExpenseLineInput[];
  onChange: (lines: ExpenseLineInput[]) => void;
}) {
  function updateLine(index: number, patch: Partial<ExpenseLineInput>) {
    const next = lines.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addLine() {
    onChange([...lines, { accountId: '', description: '', amount: 0 }]);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
        <div className="col-span-4">Category (account)</div>
        <div className="col-span-4">Description</div>
        <div className="col-span-3">Amount</div>
      </div>
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-12 items-center gap-2">
          <div className="col-span-12 sm:col-span-4">
            <Select
              value={line.accountId}
              onChange={(e) => {
                const account = expenseAccounts.find((a) => a.Id === e.target.value);
                updateLine(index, { accountId: e.target.value, accountName: account?.Name });
              }}
              required
            >
              <option value="">Select a category…</option>
              {expenseAccounts.map((account) => (
                <option key={account.Id} value={account.Id}>
                  {account.Name}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-8 sm:col-span-4">
            <Input
              value={line.description ?? ''}
              onChange={(e) => updateLine(index, { description: e.target.value })}
              placeholder="Description (optional)"
            />
          </div>
          <div className="col-span-3 sm:col-span-3">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={line.amount}
              onChange={(e) => updateLine(index, { amount: Number(e.target.value) })}
              required
            />
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
      ))}
      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="secondary" size="sm" onClick={addLine}>
          + Add line
        </Button>
        <p className="text-sm font-semibold text-slate-900">Total: {formatCurrency(total)}</p>
      </div>
    </div>
  );
}
