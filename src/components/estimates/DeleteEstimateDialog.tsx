'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Estimate } from '@/lib/quickbooks/estimates';

export function DeleteEstimateDialog({
  estimate,
  onClose,
  onDeleted,
}: {
  estimate: Estimate;
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
      const res = await fetch(`/api/estimates/${estimate.Id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncToken: estimate.SyncToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to delete estimate.');
      }
      notify('Estimate deleted.');
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
      title="Delete this estimate?"
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
          <strong>No.:</strong> {estimate.DocNumber ?? estimate.Id}
        </p>
        <p>
          <strong>Customer:</strong> {estimate.CustomerRef.name}
        </p>
        <p>
          <strong>Total:</strong> {formatCurrency(estimate.TotalAmt)}
        </p>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </Modal>
  );
}
