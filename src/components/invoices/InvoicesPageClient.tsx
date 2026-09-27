'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ConfirmSendDialog } from '@/components/ui/ConfirmSendDialog';
import { InvoiceFormDialog } from '@/components/invoices/InvoiceFormDialog';
import { ScheduleDialog } from '@/components/documents/ScheduleDialog';
import { RecurringSchedulesList } from '@/components/documents/RecurringSchedulesList';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Customer } from '@/lib/quickbooks/customers';
import type { Product } from '@/lib/quickbooks/items';
import type { Invoice } from '@/lib/quickbooks/invoices';

export function InvoicesPageClient({
  initialInvoices,
  customers,
  products,
}: {
  initialInvoices: Invoice[];
  customers: Customer[];
  products: Product[];
}) {
  const { notify } = useToast();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [formOpen, setFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>(undefined);
  const [sendTarget, setSendTarget] = useState<Invoice | null>(null);
  const [reminderTarget, setReminderTarget] = useState<Invoice | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Invoice | null>(null);
  const [scheduleListKey, setScheduleListKey] = useState(0);

  async function refresh() {
    const res = await fetch('/api/invoices', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setInvoices(data.invoices);
    }
  }

  async function handleDuplicate(invoice: Invoice) {
    try {
      const res = await fetch(`/api/invoices/${invoice.Id}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to duplicate invoice.');
      }
      notify(`Invoice duplicated as a new draft.`);
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to duplicate invoice.', 'error');
    }
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Create, send, duplicate, and schedule customer invoices."
        actions={
          <Button
            onClick={() => {
              setEditingInvoice(undefined);
              setFormOpen(true);
            }}
          >
            + New invoice
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {invoices.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No invoices yet" description="Create your first invoice to get started." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>No.</Th>
                  <Th>Customer</Th>
                  <Th>Date</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Balance</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {invoices.map((invoice) => {
                  const isPaid = invoice.Balance === 0;
                  const isOverdue = !isPaid && invoice.DueDate && new Date(invoice.DueDate) < new Date();
                  return (
                    <Tr key={invoice.Id}>
                      <Td className="font-medium text-slate-50">{invoice.DocNumber ?? invoice.Id}</Td>
                      <Td>{invoice.CustomerRef.name}</Td>
                      <Td>{formatDate(invoice.TxnDate)}</Td>
                      <Td>{formatDate(invoice.DueDate)}</Td>
                      <Td className="text-right">{formatCurrency(invoice.TotalAmt)}</Td>
                      <Td className="text-right">{formatCurrency(invoice.Balance)}</Td>
                      <Td>
                        {isPaid ? (
                          <Badge tone="success">Paid</Badge>
                        ) : isOverdue ? (
                          <Badge tone="danger">Overdue</Badge>
                        ) : (
                          <Badge tone="neutral">Open</Badge>
                        )}
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setSendTarget(invoice)}>
                            Send
                          </Button>
                          {!isPaid ? (
                            <Button size="sm" variant="ghost" onClick={() => setReminderTarget(invoice)}>
                              Remind
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingInvoice(invoice);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDuplicate(invoice)}>
                            Duplicate
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setScheduleTarget(invoice)}>
                            Schedule
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <InvoiceFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customers={customers}
        products={products}
        invoice={editingInvoice}
        onSaved={refresh}
      />

      {sendTarget ? (
        <ConfirmSendDialog
          open={Boolean(sendTarget)}
          onClose={() => setSendTarget(null)}
          title={`Send invoice ${sendTarget.DocNumber ?? ''}`}
          confirmLabel="Send invoice"
          onConfirm={async () => {
            const res = await fetch(`/api/invoices/${sendTarget.Id}/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? 'Failed to send invoice.');
            }
          }}
          onSuccess={() => {
            notify('Invoice sent.');
            refresh();
          }}
        >
          <p>
            <strong>To:</strong> {sendTarget.BillEmail?.Address ?? sendTarget.CustomerRef.name}
          </p>
          <p>
            <strong>Amount due:</strong> {formatCurrency(sendTarget.Balance)}
          </p>
          <p>
            <strong>Due date:</strong> {formatDate(sendTarget.DueDate)}
          </p>
        </ConfirmSendDialog>
      ) : null}

      {reminderTarget ? (
        <ConfirmSendDialog
          open={Boolean(reminderTarget)}
          onClose={() => setReminderTarget(null)}
          title={`Send a payment reminder for ${reminderTarget.DocNumber ?? ''}`}
          confirmLabel="Send reminder"
          onConfirm={async () => {
            const res = await fetch(`/api/invoices/${reminderTarget.Id}/reminder`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? 'Failed to send reminder.');
            }
          }}
          onSuccess={() => notify('Reminder sent.')}
        >
          <p>
            <strong>To:</strong> {reminderTarget.BillEmail?.Address ?? reminderTarget.CustomerRef.name}
          </p>
          <p>
            <strong>Balance due:</strong> {formatCurrency(reminderTarget.Balance)}
          </p>
        </ConfirmSendDialog>
      ) : null}

      {scheduleTarget ? (
        <ScheduleDialog
          open={Boolean(scheduleTarget)}
          onClose={() => setScheduleTarget(null)}
          docType="invoice"
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

      <RecurringSchedulesList key={scheduleListKey} docType="invoice" />
    </div>
  );
}
