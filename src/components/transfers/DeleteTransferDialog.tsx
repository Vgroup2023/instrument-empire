'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Transfer } from '@/lib/quickbooks/transfers';

export function DeleteTransferDialog({
  transfer,
  onClose,
  onDeleted,
}: {
  transfer: Transfer;
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
      const res = await fetch(`/api/transfers/${transfer.Id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncToken: transfer.SyncToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to delete transfer.');
      }
      notify('Transfer deleted.');
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
      title="Delete this transfer?"
      description="This permanently removes it from QuickBooks. This can't be undone from here."
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
          <strong>Date:</strong> {formatDate(transfer.TxnDate)}
        </p>
        <p>
          <strong>Amount:</strong> {formatCurrency(transfer.Amount)}
        </p>
        <p>
          <strong>From:</strong> {transfer.FromAccountRef.name} <strong>To:</strong> {transfer.ToAccountRef.name}
        </p>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </Modal>
  );
}
