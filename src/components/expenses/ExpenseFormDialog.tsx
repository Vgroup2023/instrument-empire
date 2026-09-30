'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Select } from '@/components/ui/Field';
import { VendorSelect } from '@/components/bills/VendorSelect';
import { BillLineItemsEditor } from '@/components/bills/BillLineItemsEditor';
import { useToast } from '@/components/ui/Toast';
import type { Vendor } from '@/lib/accounting/vendors';
import type { GlAccount } from '@/lib/accounting/chartOfAccounts';
import type { Expense, ExpenseAccountSuggestion, ExpenseLineInput, PaymentType } from '@/lib/accounting/expenses';

export function ExpenseFormDialog({
  open,
  onClose,
  vendors,
  expenseAccounts,
  paymentAccounts,
  expense,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  vendors: Vendor[];
  expenseAccounts: GlAccount[];
  paymentAccounts: GlAccount[];
  expense?: Expense;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const isEdit = Boolean(expense);

  const [paymentAccountId, setPaymentAccountId] = useState(
    expense?.AccountRef.value ?? paymentAccounts[0]?.Id ?? '',
  );
  const [paymentType, setPaymentType] = useState<PaymentType>(expense?.PaymentType ?? 'CreditCard');
  const [vendorId, setVendorId] = useState(expense?.EntityRef?.value ?? '');
  const [vendorName, setVendorName] = useState(expense?.EntityRef?.name ?? '');
  const [txnDate, setTxnDate] = useState(expense?.TxnDate ?? new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<ExpenseLineInput[]>(
    expense?.Line.map((l) => ({
      accountId: l.AccountBasedExpenseLineDetail.AccountRef.value,
      accountName: l.AccountBasedExpenseLineDetail.AccountRef.name,
      description: l.Description,
      amount: l.Amount,
    })) ?? [{ accountId: '', description: '', amount: 0 }],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ExpenseAccountSuggestion[]>([]);

  useEffect(() => {
    if (isEdit || !vendorId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing a stale suggestion when the vendor changes, not a derived-state sync
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/expenses/suggest-account?vendorId=${vendorId}`)
      .then((res) => (res.ok ? res.json() : { suggestions: [] }))
      .then((data) => {
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId, isEdit]);

  function applySuggestion(suggestion: ExpenseAccountSuggestion) {
    const emptyIndex = lines.findIndex((l) => !l.accountId);
    if (emptyIndex === -1) return;
    const next = lines.slice();
    next[emptyIndex] = { ...next[emptyIndex], accountId: suggestion.accountId, accountName: suggestion.accountName };
    setLines(next);
  }

  const firstEmptyLineIndex = lines.findIndex((l) => !l.accountId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.accountId && l.amount > 0);
      if (validLines.length === 0) throw new Error('Add at least one expense line with an amount.');
      if (!paymentAccountId) throw new Error('Choose which account this was paid from.');

      const paymentAccount = paymentAccounts.find((a) => a.Id === paymentAccountId);
      const res = await fetch(isEdit ? `/api/expenses/${expense!.Id}` : '/api/expenses', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { syncToken: expense!.SyncToken } : {}),
          paymentAccountId,
          paymentAccountName: paymentAccount?.Name,
          paymentType,
          vendorId: vendorId || undefined,
          vendorName: vendorId ? vendorName : undefined,
          txnDate,
          lines: validLines,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save expense.');
      }
      notify(isEdit ? 'Expense updated.' : 'Expense recorded.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit expense' : 'Record an expense'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="paymentAccount">Paid from</Label>
            {paymentAccounts.length > 0 ? (
              <Select
                id="paymentAccount"
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
                required
              >
                {paymentAccounts.map((account) => (
                  <option key={account.Id} value={account.Id}>
                    {account.Name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-sm text-red-600">No bank/credit card accounts found.</p>
            )}
          </div>
          <div>
            <Label htmlFor="paymentType">Payment method</Label>
            <Select id="paymentType" value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)}>
              <option value="CreditCard">Credit/debit card</option>
              <option value="Cash">Cash</option>
              <option value="Check">Check</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="txnDate">Date</Label>
            <Input id="txnDate" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <Label htmlFor="vendor">Vendor (optional)</Label>
          <VendorSelect
            vendors={vendors}
            value={vendorId}
            required={false}
            onChange={(id, name) => {
              setVendorId(id);
              setVendorName(name);
            }}
          />
        </div>
        {suggestions.length > 0 && firstEmptyLineIndex !== -1 ? (
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
            <p>
              Suggested category: <strong>{suggestions[0].accountName}</strong> — used for {suggestions[0].count}{' '}
              previous expense{suggestions[0].count === 1 ? '' : 's'} from this vendor.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-1"
              onClick={() => applySuggestion(suggestions[0])}
            >
              Apply to line {firstEmptyLineIndex + 1}
            </Button>
          </div>
        ) : null}
        <div>
          <Label>Expense lines</Label>
          <BillLineItemsEditor expenseAccounts={expenseAccounts} lines={lines} onChange={setLines} />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={paymentAccounts.length === 0}>
            {isEdit ? 'Save changes' : 'Record expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
