'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input } from '@/components/ui/Field';
import { VendorSelect } from '@/components/bills/VendorSelect';
import { BillLineItemsEditor } from '@/components/bills/BillLineItemsEditor';
import { CurrencyExchangeRateField } from '@/components/documents/CurrencyExchangeRateField';
import { useToast } from '@/components/ui/Toast';
import type { Vendor } from '@/lib/accounting/vendors';
import type { GlAccount } from '@/lib/accounting/chartOfAccounts';
import type { ExpenseLineInput, Bill } from '@/lib/accounting/bills';

interface BillFormDialogProps {
  open: boolean;
  onClose: () => void;
  vendors: Vendor[];
  expenseAccounts: GlAccount[];
  bill?: Bill;
  homeCurrencyCode?: string;
  onSaved: () => void;
}

export function BillFormDialog({
  open,
  onClose,
  vendors,
  expenseAccounts,
  bill,
  homeCurrencyCode,
  onSaved,
}: BillFormDialogProps) {
  const { notify } = useToast();
  const isEdit = Boolean(bill);

  const [vendorId, setVendorId] = useState(bill?.VendorRef.value ?? '');
  const [vendorName, setVendorName] = useState(bill?.VendorRef.name ?? '');
  const [vendorCurrency, setVendorCurrency] = useState(bill?.CurrencyRef);
  const [exchangeRate, setExchangeRate] = useState(bill?.ExchangeRate ?? 1);
  const [dueDate, setDueDate] = useState(bill?.DueDate ?? '');
  const [lines, setLines] = useState<ExpenseLineInput[]>(
    bill?.Line.map((l) => ({
      accountId: l.AccountBasedExpenseLineDetail.AccountRef.value,
      accountName: l.AccountBasedExpenseLineDetail.AccountRef.name,
      description: l.Description,
      amount: l.Amount,
    })) ?? [{ accountId: '', description: '', amount: 0 }],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isForeignCurrency = Boolean(
    !isEdit && homeCurrencyCode && vendorCurrency && vendorCurrency.value !== homeCurrencyCode,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.accountId && l.amount > 0);
      if (validLines.length === 0) throw new Error('Add at least one expense line with an amount.');

      const res = await fetch(isEdit ? `/api/bills/${bill!.Id}` : '/api/bills', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { syncToken: bill!.SyncToken, dueDate, lines: validLines, vendorId, vendorName }
            : {
                vendorId,
                vendorName,
                dueDate: dueDate || undefined,
                lines: validLines,
                currencyCode: isForeignCurrency ? vendorCurrency!.value : undefined,
                exchangeRate: isForeignCurrency ? exchangeRate : undefined,
              },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save bill.');
      }
      notify(isEdit ? 'Bill updated.' : 'Bill recorded.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit bill' : 'Record a bill'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="vendor">Vendor</Label>
            <VendorSelect
              vendors={vendors}
              value={vendorId}
              onChange={(id, name, currencyRef) => {
                setVendorId(id);
                setVendorName(name);
                setVendorCurrency(currencyRef);
                setExchangeRate(1);
              }}
            />
          </div>
          <div>
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        {isForeignCurrency ? (
          <CurrencyExchangeRateField
            currencyCode={vendorCurrency!.value}
            homeCurrencyCode={homeCurrencyCode}
            exchangeRate={exchangeRate}
            onExchangeRateChange={setExchangeRate}
          />
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
          <Button type="submit" loading={loading}>
            {isEdit ? 'Save changes' : 'Record bill'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
