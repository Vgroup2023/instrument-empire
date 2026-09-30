'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input } from '@/components/ui/Field';
import { formatCurrency } from '@/lib/format';
import type { Bill } from '@/lib/accounting/bills';

export function ApproveBillDialog({
  bill,
  onClose,
  onApproved,
}: {
  bill: Bill;
  onClose: () => void;
  onApproved: () => void;
}) {
  const [scheduledPaymentDate, setScheduledPaymentDate] = useState(bill.DueDate ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bills/${bill.Id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledPaymentDate: scheduledPaymentDate || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to approve bill.');
      }
      onApproved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Nothing was approved.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={loading ? () => {} : onClose}
      title={`Approve bill from ${bill.VendorRef.name ?? 'vendor'}`}
      description="Approving unlocks payment for this bill — it still won't be paid until you click Pay."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} loading={loading}>
            Approve
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Balance due:{' '}
          <span className="font-medium text-slate-900">{formatCurrency(bill.Balance, bill.CurrencyRef?.value)}</span>
        </p>
        <div>
          <Label htmlFor="scheduledPaymentDate">Planned pay date (optional)</Label>
          <Input
            id="scheduledPaymentDate"
            type="date"
            value={scheduledPaymentDate}
            onChange={(e) => setScheduledPaymentDate(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            Leave blank to just mark this approved — you can pay it whenever you&apos;re ready.
          </p>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </div>
    </Modal>
  );
}
