'use client';

import { useState } from 'react';
import { usePagedList } from '@/components/ui/usePagedList';
import { LoadMoreBar } from '@/components/ui/LoadMoreBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ConfirmSendDialog } from '@/components/ui/ConfirmSendDialog';
import { EstimateFormDialog } from '@/components/estimates/EstimateFormDialog';
import { DeleteEstimateDialog } from '@/components/estimates/DeleteEstimateDialog';
import { ScheduleDialog } from '@/components/documents/ScheduleDialog';
import { RecurringSchedulesList } from '@/components/documents/RecurringSchedulesList';
import { DocumentsDialog } from '@/components/documents/DocumentsDialog';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Customer } from '@/lib/accounting/customers';
import type { Product } from '@/lib/accounting/products';
import type { Estimate } from '@/lib/accounting/estimates';

const statusTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  Pending: 'neutral',
  Accepted: 'success',
  Closed: 'success',
  Rejected: 'danger',
};

export function EstimatesPageClient({
  initialEstimates,
  initialTotal,
  customers,
  products,
}: {
  initialEstimates: Estimate[];
  initialTotal: number;
  customers: Customer[];
  products: Product[];
}) {
  const { notify } = useToast();
  const list = usePagedList<Estimate>('/api/estimates', 'estimates', initialEstimates, initialTotal);
  const estimates = list.items;
  const [formOpen, setFormOpen] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<Estimate | undefined>(undefined);
  const [sendTarget, setSendTarget] = useState<Estimate | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Estimate | null>(null);
  const [scheduleListKey, setScheduleListKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Estimate | null>(null);
  const [documentsTarget, setDocumentsTarget] = useState<Estimate | null>(null);
  const [generalDocumentsOpen, setGeneralDocumentsOpen] = useState(false);

  async function refresh() {
    return list.refresh();
  }

  async function handleDuplicate(estimate: Estimate) {
    try {
      const res = await fetch(`/api/estimates/${estimate.Id}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to duplicate estimate.');
      }
      notify('Estimate duplicated as a new draft.');
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to duplicate estimate.', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Estimates"
        description="Create, send, duplicate, and schedule customer estimates."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setGeneralDocumentsOpen(true)}>
              Documents
            </Button>
            <Button
              onClick={() => {
                setEditingEstimate(undefined);
                setFormOpen(true);
              }}
            >
              + New estimate
            </Button>
          </div>
        }
      />

      <Card>
        <CardBody className="p-0">
          {estimates.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No estimates yet" description="Create your first estimate to get started." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>No.</Th>
                  <Th>Customer</Th>
                  <Th>Date</Th>
                  <Th>Expires</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {estimates.map((estimate) => (
                  <Tr key={estimate.Id}>
                    <Td className="font-medium text-slate-900">{estimate.DocNumber ?? estimate.Id}</Td>
                    <Td>{estimate.CustomerRef.name}</Td>
                    <Td>{formatDate(estimate.TxnDate)}</Td>
                    <Td>{formatDate(estimate.ExpirationDate)}</Td>
                    <Td className="text-right">{formatCurrency(estimate.TotalAmt)}</Td>
                    <Td>
                      <Badge tone={statusTone[estimate.TxnStatus ?? ''] ?? 'neutral'}>
                        {estimate.TxnStatus ?? 'Pending'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setSendTarget(estimate)}>
                          Send
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingEstimate(estimate);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDuplicate(estimate)}>
                          Duplicate
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setScheduleTarget(estimate)}>
                          Schedule
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDocumentsTarget(estimate)}>
                          Documents
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(estimate)}>
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        <LoadMoreBar shown={estimates.length} total={list.total} loading={list.loadingMore} onLoadMore={list.loadMore} noun="estimates" />
        </CardBody>
      </Card>

      <EstimateFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customers={customers}
        products={products}
        estimate={editingEstimate}
        onSaved={refresh}
      />

      {sendTarget ? (
        <ConfirmSendDialog
          open={Boolean(sendTarget)}
          onClose={() => setSendTarget(null)}
          title={`Send estimate ${sendTarget.DocNumber ?? ''}`}
          confirmLabel="Send estimate"
          onConfirm={async () => {
            const res = await fetch(`/api/estimates/${sendTarget.Id}/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? 'Failed to send estimate.');
            }
          }}
          onSuccess={() => {
            notify('Estimate sent.');
            refresh();
          }}
        >
          <p>
            <strong>To:</strong> {sendTarget.BillEmail?.Address ?? sendTarget.CustomerRef.name}
          </p>
          <p>
            <strong>Amount:</strong> {formatCurrency(sendTarget.TotalAmt)}
          </p>
          <p>
            <strong>Expires:</strong> {formatDate(sendTarget.ExpirationDate)}
          </p>
        </ConfirmSendDialog>
      ) : null}

      {scheduleTarget ? (
        <ScheduleDialog
          open={Boolean(scheduleTarget)}
          onClose={() => setScheduleTarget(null)}
          docType="estimate"
          customerId={scheduleTarget.CustomerRef.value}
          customerName={scheduleTarget.CustomerRef.name ?? ''}
          email={scheduleTarget.BillEmail?.Address}
          lines={scheduleTarget.Line.map((l) => ({
            itemId: l.SalesItemLineDetail.ItemRef.value,
            itemName: l.SalesItemLineDetail.ItemRef.name,
            quantity: l.SalesItemLineDetail.Qty,
            unitPrice: l.SalesItemLineDetail.UnitPrice,
            description: l.Description,
          }))}
          onCreated={() => setScheduleListKey((k) => k + 1)}
        />
      ) : null}

      <RecurringSchedulesList key={scheduleListKey} docType="estimate" />

      {deleteTarget ? (
        <DeleteEstimateDialog estimate={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refresh} />
      ) : null}

      {documentsTarget ? (
        <DocumentsDialog
          entityType="estimate"
          entityId={documentsTarget.Id}
          title={documentsTarget.DocNumber ?? documentsTarget.Id}
          onClose={() => setDocumentsTarget(null)}
        />
      ) : null}

      {generalDocumentsOpen ? (
        <DocumentsDialog entityType="estimate" title="General" onClose={() => setGeneralDocumentsOpen(false)} />
      ) : null}
    </div>
  );
}
