'use client';

import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/format';
import { balanceOf, type JournalLineInput } from '@/lib/quickbooks/journalEntryTypes';
import type { Account } from '@/lib/accounting/chartOfAccounts';

export function JournalLinesEditor({
  accounts,
  lines,
  onChange,
}: {
  accounts: Account[];
  lines: JournalLineInput[];
  onChange: (lines: JournalLineInput[]) => void;
}) {
  function updateLine(index: number, patch: Partial<JournalLineInput>) {
    const next = lines.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addLine() {
    onChange([...lines, { accountId: '', postingType: 'Debit', amount: 0, description: '' }]);
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index));
  }

  const { debits, credits, isBalanced } = balanceOf(lines);
  const difference = Math.round((debits - credits) * 100) / 100;

  return (
    <div className="space-y-3">
      <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-slate-500 sm:grid">
        <div className="col-span-4">Account</div>
        <div className="col-span-3">Description</div>
        <div className="col-span-2">Debit</div>
        <div className="col-span-2">Credit</div>
      </div>
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-12 items-center gap-2">
          <div className="col-span-12 sm:col-span-4">
            <Select
              value={line.accountId}
              onChange={(e) => {
                const account = accounts.find((a) => a.Id === e.target.value);
                updateLine(index, { accountId: e.target.value, accountName: account?.Name });
              }}
              required
            >
              <option value="">Select an account…</option>
              {accounts.map((account) => (
                <option key={account.Id} value={account.Id}>
                  {account.Name}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Input
              value={line.description ?? ''}
              onChange={(e) => updateLine(index, { description: e.target.value })}
              placeholder="Description (optional)"
            />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={line.postingType === 'Debit' ? line.amount : 0}
              onChange={(e) => updateLine(index, { postingType: 'Debit', amount: Number(e.target.value) })}
            />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={line.postingType === 'Credit' ? line.amount : 0}
              onChange={(e) => updateLine(index, { postingType: 'Credit', amount: Number(e.target.value) })}
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
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600">
            Debits: <span className="font-medium text-slate-900">{formatCurrency(debits)}</span>
          </span>
          <span className="text-slate-600">
            Credits: <span className="font-medium text-slate-900">{formatCurrency(credits)}</span>
          </span>
          {isBalanced ? (
            <Badge tone="success">Balanced</Badge>
          ) : (
            <Badge tone="danger">Out of balance by {formatCurrency(Math.abs(difference))}</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
