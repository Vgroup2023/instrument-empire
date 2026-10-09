'use client';

import { useState } from 'react';
import { usePagedList } from '@/components/ui/usePagedList';
import { LoadMoreBar } from '@/components/ui/LoadMoreBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { TransferFormDialog } from '@/components/transfers/TransferFormDialog';
import { DeleteTransferDialog } from '@/components/transfers/DeleteTransferDialog';
import { formatCurrency, formatDate } from '@/lib/format';
import type { GlAccount } from '@/lib/accounting/chartOfAccounts';
import type { Transfer } from '@/lib/accounting/transfers';

export function TransfersPageClient({
  initialTransfers,
  initialTotal,
  accounts,
}: {
  initialTransfers: Transfer[];
  initialTotal: number;
  accounts: GlAccount[];
}) {
  const list = usePagedList<Transfer>('/api/transfers', 'transfers', initialTransfers, initialTotal);
  const transfers = list.items;
  const [formOpen, setFormOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Transfer | null>(null);

  async function refresh() {
    return list.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Bank transfers"
        description="Move money between your own bank and credit card accounts."
        actions={
          <Button
            onClick={() => {
              setEditingTransfer(undefined);
              setFormOpen(true);
            }}
          >
            + Transfer money
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {transfers.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No transfers yet" description="Record your first transfer to get started." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>From</Th>
                  <Th>To</Th>
                  <Th>Memo</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {transfers.map((transfer) => (
                  <Tr key={transfer.Id}>
                    <Td>{formatDate(transfer.TxnDate)}</Td>
                    <Td className="font-medium text-slate-900">{transfer.FromAccountRef.name}</Td>
                    <Td className="font-medium text-slate-900">{transfer.ToAccountRef.name}</Td>
                    <Td className="text-slate-500">{transfer.PrivateNote ?? '—'}</Td>
                    <Td className="text-right">{formatCurrency(transfer.Amount)}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingTransfer(transfer);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(transfer)}>
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        <LoadMoreBar shown={transfers.length} total={list.total} loading={list.loadingMore} onLoadMore={list.loadMore} noun="transfers" />
        </CardBody>
      </Card>

      <TransferFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        accounts={accounts}
        transfer={editingTransfer}
        onSaved={refresh}
      />

      {deleteTarget ? (
        <DeleteTransferDialog transfer={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refresh} />
      ) : null}
    </div>
  );
}
