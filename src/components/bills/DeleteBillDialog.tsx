'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Bill } from '@/lib/quickbooks/bills';

export function DeleteBillDialog({
  bill,
  onClose,
  onDeleted,
}: {
  bill: Bill;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bills/${bill.Id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncToken: bill.SyncToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to delete bill.');
      }
      notify('Bill deleted.');
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Nothing was deleted.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open
      onClose={loading ? () => {} : onClose}
      title="Delete this bill?"
      description="This permanently removes it from QuickBooks. If a payment has already been applied, QuickBooks will reject the delete until that payment is removed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={loading}>
            Delete
          </Button>
        </>
      }
    >
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <p>
          <strong>No.:</strong> {bill.DocNumber ?? bill.Id}
        </p>
        <p>
          <strong>Vendor:</strong> {bill.VendorRef.name}
        </p>
        <p>
          <strong>Total:</strong> {formatCurrency(bill.TotalAmt, bill.CurrencyRef?.value)}
        </p>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </Modal>
  );
}
