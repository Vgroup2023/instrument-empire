'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Select } from '@/components/ui/Field';
import { VendorSelect } from '@/components/bills/VendorSelect';
import { BillLineItemsEditor } from '@/components/bills/BillLineItemsEditor';
import { useToast } from '@/components/ui/Toast';
import type { Vendor } from '@/lib/quickbooks/vendors';
import type { GlAccount } from '@/lib/quickbooks/accounts';
import type { ExpenseLineInput, PaymentType } from '@/lib/quickbooks/expenses';

export function ExpenseFormDialog({
  open,
  onClose,
  vendors,
  expenseAccounts,
  paymentAccounts,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  vendors: Vendor[];
  expenseAccounts: GlAccount[];
  paymentAccounts: GlAccount[];
  onSaved: () => void;
}) {
  const { notify } = useToast();

  const [paymentAccountId, setPaymentAccountId] = useState(paymentAccounts[0]?.Id ?? '');
  const [paymentType, setPaymentType] = useState<PaymentType>('CreditCard');
  const [vendorId, setVendorId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<ExpenseLineInput[]>([{ accountId: '', description: '', amount: 0 }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.accountId && l.amount > 0);
      if (validLines.length === 0) throw new Error('Add at least one expense line with an amount.');
      if (!paymentAccountId) throw new Error('Choose which account this was paid from.');

      const paymentAccount = paymentAccounts.find((a) => a.Id === paymentAccountId);
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        throw new Error(data.error ?? 'Failed to record expense.');
      }
      notify('Expense recorded.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record an expense" size="lg">
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
            Record expense
          </Button>
        </div>
      </form>
    </Modal>
  );
}
