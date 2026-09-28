'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { JournalEntryFormDialog } from '@/components/journal-entries/JournalEntryFormDialog';
import { DeleteJournalEntryDialog } from '@/components/journal-entries/DeleteJournalEntryDialog';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Account } from '@/lib/accounting/chartOfAccounts';
import type { JournalEntry } from '@/lib/accounting/journalEntries';

export function JournalEntriesPageClient({
  initialJournalEntries,
  accounts,
}: {
  initialJournalEntries: JournalEntry[];
  accounts: Account[];
}) {
  const [journalEntries, setJournalEntries] = useState(initialJournalEntries);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null);

  async function refresh() {
    const res = await fetch('/api/journal-entries', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setJournalEntries(data.journalEntries);
    }
  }

  function totalOf(entry: JournalEntry) {
    return entry.Line.filter((l) => l.JournalEntryLineDetail.PostingType === 'Debit').reduce(
      (sum, l) => sum + l.Amount,
      0,
    );
  }

  return (
    <div>
      <PageHeader
        title="Journal entries"
        description="Manual double-entry adjustments — accruals, corrections, depreciation, and the like."
        actions={
          <Button
            onClick={() => {
              setEditingEntry(undefined);
              setFormOpen(true);
            }}
          >
            + New journal entry
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {journalEntries.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No journal entries yet"
                description="Record your first manual adjustment to get started."
              />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>No.</Th>
                  <Th>Date</Th>
                  <Th>Memo</Th>
                  <Th>Lines</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {journalEntries.map((entry) => (
                  <Tr key={entry.Id}>
                    <Td className="font-medium text-slate-900">{entry.DocNumber ?? entry.Id}</Td>
                    <Td>{formatDate(entry.TxnDate)}</Td>
                    <Td className="text-slate-500">{entry.PrivateNote ?? '—'}</Td>
                    <Td className="text-slate-500">{entry.Line.length}</Td>
                    <Td className="text-right">{formatCurrency(totalOf(entry))}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingEntry(entry);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(entry)}>
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <JournalEntryFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        accounts={accounts}
        journalEntry={editingEntry}
        onSaved={refresh}
      />

      {deleteTarget ? (
        <DeleteJournalEntryDialog
          journalEntry={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={refresh}
        />
      ) : null}
    </div>
  );
}
