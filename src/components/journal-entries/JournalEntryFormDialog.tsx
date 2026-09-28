'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Textarea } from '@/components/ui/Field';
import { JournalLinesEditor } from '@/components/journal-entries/JournalLinesEditor';
import { useToast } from '@/components/ui/Toast';
import { balanceOf, type JournalLineInput } from '@/lib/quickbooks/journalEntryTypes';
import type { JournalEntry } from '@/lib/quickbooks/journalEntries';
import type { Account } from '@/lib/quickbooks/chartOfAccounts';

interface JournalEntryFormDialogProps {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  journalEntry?: JournalEntry;
  onSaved: () => void;
}

export function JournalEntryFormDialog({ open, onClose, accounts, journalEntry, onSaved }: JournalEntryFormDialogProps) {
  const { notify } = useToast();
  const isEdit = Boolean(journalEntry);

  const [txnDate, setTxnDate] = useState(journalEntry?.TxnDate ?? new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState(journalEntry?.PrivateNote ?? '');
  const [lines, setLines] = useState<JournalLineInput[]>(
    journalEntry?.Line.map((l) => ({
      accountId: l.JournalEntryLineDetail.AccountRef.value,
      accountName: l.JournalEntryLineDetail.AccountRef.name,
      postingType: l.JournalEntryLineDetail.PostingType,
      amount: l.Amount,
      description: l.Description,
    })) ?? [
      { accountId: '', postingType: 'Debit', amount: 0, description: '' },
      { accountId: '', postingType: 'Credit', amount: 0, description: '' },
    ],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.accountId && l.amount > 0);
      if (validLines.length < 2) throw new Error('Add at least two lines with an account and an amount.');
      if (!balanceOf(validLines).isBalanced) {
        throw new Error('Total debits must equal total credits before this can be saved.');
      }

      const res = await fetch(isEdit ? `/api/journal-entries/${journalEntry!.Id}` : '/api/journal-entries', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { syncToken: journalEntry!.SyncToken, txnDate, memo: memo || undefined, lines: validLines }
            : { txnDate, memo: memo || undefined, lines: validLines },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save journal entry.');
      }
      notify(isEdit ? 'Journal entry updated.' : 'Journal entry recorded.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit journal entry' : 'New journal entry'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="txnDate">Date</Label>
            <Input id="txnDate" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} required />
          </div>
        </div>
        <div>
          <Label htmlFor="memo">Memo (optional)</Label>
          <Textarea id="memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </div>
        <div>
          <Label>Lines</Label>
          <JournalLinesEditor accounts={accounts} lines={lines} onChange={setLines} />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEdit ? 'Save changes' : 'Record journal entry'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
