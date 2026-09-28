'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Select, Textarea } from '@/components/ui/Field';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Invoice, InvoicePayment, DepositAccount } from '@/lib/accounting/invoices';

export function RecordInvoicePaymentDialog({
  invoice,
  depositAccounts,
  onClose,
  onChanged,
}: {
  invoice: Invoice;
  depositAccounts: DepositAccount[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify } = useToast();
  const [payments, setPayments] = useState<InvoicePayment[] | null>(null);
  const [amount, setAmount] = useState(String(invoice.Balance));
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [depositAccountId, setDepositAccountId] = useState(depositAccounts[0]?.Id ?? '');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPayments() {
    const res = await fetch(`/api/invoices/${invoice.Id}/payments`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setPayments(data.payments);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no external state to sync from
    loadPayments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoice.Id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(amount),
          paymentDate,
          depositAccountId,
          memo: memo || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to record payment.');
      }
      notify('Payment recorded.');
      setAmount('0');
      setMemo('');
      await loadPayments();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(paymentId: string) {
    const res = await fetch(`/api/invoices/${invoice.Id}/payments/${paymentId}`, { method: 'DELETE' });
    if (res.ok) {
      notify('Payment removed.');
      await loadPayments();
      onChanged();
    } else {
      const data = await res.json().catch(() => ({}));
      notify(data.error ?? 'Failed to remove payment.', 'error');
    }
  }

  const balance = invoice.Balance;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Payments on invoice ${invoice.DocNumber ?? invoice.Id}`}
      description={`Balance due: ${formatCurrency(balance)}`}
      size="lg"
    >
      <div className="space-y-4">
        {payments && payments.length > 0 ? (
          <Table>
            <Thead>
              <Tr>
                <Th>Date</Th>
                <Th>Deposited to</Th>
                <Th className="text-right">Amount</Th>
                <Th>Memo</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {payments.map((payment) => (
                <Tr key={payment.Id}>
                  <Td>{formatDate(payment.PaymentDate)}</Td>
                  <Td>{payment.DepositAccountRef.name}</Td>
                  <Td className="text-right">{formatCurrency(payment.Amount)}</Td>
                  <Td>{payment.Memo ?? '—'}</Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => handleRemove(payment.Id)}>
                      Remove
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ) : null}

        {balance > 0 ? (
          <form onSubmit={handleRecord} className="space-y-3 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-700">Record a payment</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="payAmount">Amount</Label>
                <Input
                  id="payAmount"
                  type="number"
                  min={0}
                  max={balance}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="payDate">Date</Label>
                <Input id="payDate" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="depositAccount">Deposit to</Label>
                {depositAccounts.length > 0 ? (
                  <Select
                    id="depositAccount"
                    value={depositAccountId}
                    onChange={(e) => setDepositAccountId(e.target.value)}
                    required
                  >
                    {depositAccounts.map((account) => (
                      <option key={account.Id} value={account.Id}>
                        {account.Name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="text-sm text-red-600">No bank accounts found — add one on the Chart of accounts page.</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="payMemo">Memo (optional)</Label>
              <Textarea id="payMemo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                Close
              </Button>
              <Button type="submit" loading={loading} disabled={depositAccounts.length === 0}>
                Record payment
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
