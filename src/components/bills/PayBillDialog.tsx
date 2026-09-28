'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Bill } from '@/lib/quickbooks/bills';
import type { GlAccount } from '@/lib/quickbooks/accounts';

export function PayBillDialog({
  bill,
  bankAccounts,
  onClose,
  onPaid,
}: {
  bill: Bill;
  bankAccounts: GlAccount[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const { notify } = useToast();
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.Id ?? '');
  const [amount, setAmount] = useState(String(bill.Balance));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const bankAccount = bankAccounts.find((a) => a.Id === bankAccountId);
      const res = await fetch(`/api/bills/${bill.Id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: bill.VendorRef.value,
          vendorName: bill.VendorRef.name,
          amount: Number(amount),
          bankAccountId,
          bankAccountName: bankAccount?.Name,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to pay bill.');
      }
      notify('Bill payment recorded.');
      onPaid();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Nothing was paid.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={loading ? () => {} : onClose}
      title={`Pay bill from ${bill.VendorRef.name ?? 'vendor'}`}
      description="This records a real bill payment in QuickBooks against the account you choose below."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={loading} disabled={bankAccounts.length === 0}>
            Pay bill
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Balance due: <span className="font-medium text-slate-900">{formatCurrency(bill.Balance)}</span>
        </p>
        <div>
          <Label htmlFor="payAmount">Amount to pay</Label>
          <Input
            id="payAmount"
            type="number"
            min={0}
            max={bill.Balance}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="bankAccount">Pay from</Label>
          {bankAccounts.length > 0 ? (
            <Select id="bankAccount" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} required>
              {bankAccounts.map((account) => (
                <option key={account.Id} value={account.Id}>
                  {account.Name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm text-red-600">No bank accounts found in QuickBooks — add one there first.</p>
          )}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
