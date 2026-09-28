'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { JournalEntry } from '@/lib/quickbooks/journalEntries';

export function DeleteJournalEntryDialog({
  journalEntry,
  onClose,
  onDeleted,
}: {
  journalEntry: JournalEntry;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = journalEntry.Line.filter((l) => l.JournalEntryLineDetail.PostingType === 'Debit').reduce(
    (sum, l) => sum + l.Amount,
    0,
  );

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/journal-entries/${journalEntry.Id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncToken: journalEntry.SyncToken }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to delete journal entry.');
      }
      notify('Journal entry deleted.');
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
      title="Delete this journal entry?"
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
          <strong>Date:</strong> {formatDate(journalEntry.TxnDate)}
        </p>
        <p>
          <strong>Amount:</strong> {formatCurrency(total)}
        </p>
        {journalEntry.PrivateNote ? (
          <p>
            <strong>Memo:</strong> {journalEntry.PrivateNote}
          </p>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </Modal>
  );
}
