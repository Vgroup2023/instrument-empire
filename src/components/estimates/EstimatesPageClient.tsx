'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ConfirmSendDialog } from '@/components/ui/ConfirmSendDialog';
import { EstimateFormDialog } from '@/components/estimates/EstimateFormDialog';
import { ScheduleDialog } from '@/components/documents/ScheduleDialog';
import { RecurringSchedulesList } from '@/components/documents/RecurringSchedulesList';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Customer } from '@/lib/quickbooks/customers';
import type { Product } from '@/lib/quickbooks/items';
import type { Estimate } from '@/lib/quickbooks/estimates';

const statusTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  Pending: 'neutral',
  Accepted: 'success',
  Closed: 'success',
  Rejected: 'danger',
};

export function EstimatesPageClient({
  initialEstimates,
  customers,
  products,
}: {
  initialEstimates: Estimate[];
  customers: Customer[];
  products: Product[];
}) {
  const { notify } = useToast();
  const [estimates, setEstimates] = useState(initialEstimates);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<Estimate | undefined>(undefined);
  const [sendTarget, setSendTarget] = useState<Estimate | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Estimate | null>(null);
  const [scheduleListKey, setScheduleListKey] = useState(0);

  async function refresh() {
    const res = await fetch('/api/estimates', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setEstimates(data.estimates);
    }
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
          <Button
            onClick={() => {
              setEditingEstimate(undefined);
              setFormOpen(true);
            }}
          >
            + New estimate
          </Button>
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
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
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
          }))}
          onCreated={() => setScheduleListKey((k) => k + 1)}
        />
      ) : null}

      <RecurringSchedulesList key={scheduleListKey} docType="estimate" />
    </div>
  );
}
