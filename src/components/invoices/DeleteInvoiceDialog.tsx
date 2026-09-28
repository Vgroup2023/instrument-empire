'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Invoice } from '@/lib/quickbooks/invoices';

export function DeleteInvoiceDialog({
  invoice,
  onClose,
  onDeleted,
}: {
  invoice: Invoice;
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
      const res = await fetch(`/api/invoices/${invoice.Id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncToken: invoice.SyncToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to delete invoice.');
      }
      notify('Invoice deleted.');
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
      title="Delete this invoice?"
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
          <strong>No.:</strong> {invoice.DocNumber ?? invoice.Id}
        </p>
        <p>
          <strong>Customer:</strong> {invoice.CustomerRef.name}
        </p>
        <p>
          <strong>Total:</strong> {formatCurrency(invoice.TotalAmt, invoice.CurrencyRef?.value)}
        </p>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </Modal>
  );
}
