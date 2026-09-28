'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import type { GlAccount } from '@/lib/quickbooks/accounts';

export function TransferFormDialog({
  open,
  onClose,
  accounts,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  accounts: GlAccount[];
  onSaved: () => void;
}) {
  const { notify } = useToast();

  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.Id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.Id ?? accounts[0]?.Id ?? '');
  const [amount, setAmount] = useState('0');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (fromAccountId === toAccountId) throw new Error('Choose two different accounts.');
      const numAmount = Number(amount);
      if (!numAmount || numAmount <= 0) throw new Error('Enter an amount greater than zero.');

      const fromAccount = accounts.find((a) => a.Id === fromAccountId);
      const toAccount = accounts.find((a) => a.Id === toAccountId);
      const res = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAccountId,
          fromAccountName: fromAccount?.Name,
          toAccountId,
          toAccountName: toAccount?.Name,
          amount: numAmount,
          txnDate,
          memo: memo || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to record transfer.');
      }
      notify('Transfer recorded.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Transfer between accounts">
      <form onSubmit={handleSubmit} className="space-y-4">
        {accounts.length < 2 ? (
          <p className="text-sm text-red-600">
            You need at least two bank or credit card accounts in QuickBooks to record a transfer.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="fromAccount">From</Label>
                <Select id="fromAccount" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)} required>
                  {accounts.map((account) => (
                    <option key={account.Id} value={account.Id}>
                      {account.Name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="toAccount">To</Label>
                <Select id="toAccount" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} required>
                  {accounts.map((account) => (
                    <option key={account.Id} value={account.Id}>
                      {account.Name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="txnDate">Date</Label>
                <Input id="txnDate" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label htmlFor="memo">Memo (optional)</Label>
              <Textarea id="memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
          </>
        )}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={accounts.length < 2}>
            Record transfer
          </Button>
        </div>
      </form>
    </Modal>
  );
}
