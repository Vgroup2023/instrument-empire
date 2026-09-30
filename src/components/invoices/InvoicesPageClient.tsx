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
import { MilestonePlanDialog } from '@/components/invoices/MilestonePlanDialog';
import { DeleteInvoiceDialog } from '@/components/invoices/DeleteInvoiceDialog';
import { RecordInvoicePaymentDialog } from '@/components/invoices/RecordInvoicePaymentDialog';
import { ScheduleDialog } from '@/components/documents/ScheduleDialog';
import { RecurringSchedulesList } from '@/components/documents/RecurringSchedulesList';
import { DocumentsDialog } from '@/components/documents/DocumentsDialog';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Customer } from '@/lib/accounting/customers';
import type { Product } from '@/lib/accounting/products';
import type { Invoice, DepositAccount } from '@/lib/accounting/invoices';
import { suggestReminderAction, type ReminderTone } from '@/lib/accounting/reminderSuggestions';

const REMINDER_TONE_TEXT: Record<ReminderTone, string> = {
  neutral: 'text-slate-600',
  warning: 'text-gold-800',
  danger: 'text-red-600',
};

export function InvoicesPageClient({
  initialInvoices,
  customers,
  products,
  depositAccounts,
  homeCurrencyCode,
}: {
  initialInvoices: Invoice[];
  customers: Customer[];
  products: Product[];
  depositAccounts: DepositAccount[];
  homeCurrencyCode?: string;
}) {
  const { notify } = useToast();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [formOpen, setFormOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | undefined>(undefined);
  const [sendTarget, setSendTarget] = useState<Invoice | null>(null);
  const [reminderTarget, setReminderTarget] = useState<Invoice | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<Invoice | null>(null);
  const [scheduleListKey, setScheduleListKey] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<Invoice | null>(null);
  const [documentsTarget, setDocumentsTarget] = useState<Invoice | null>(null);
  const [generalDocumentsOpen, setGeneralDocumentsOpen] = useState(false);
  const [milestonePlanOpen, setMilestonePlanOpen] = useState(false);

  async function refresh() {
    const res = await fetch('/api/invoices', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setInvoices(data.invoices);
      return data.invoices as Invoice[];
    }
    return null;
  }

  async function handlePaymentsChanged() {
    const updated = await refresh();
    if (updated && paymentTarget) {
      setPaymentTarget(updated.find((i) => i.Id === paymentTarget.Id) ?? null);
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
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setGeneralDocumentsOpen(true)}>
              Documents
            </Button>
            <Button variant="secondary" onClick={() => setMilestonePlanOpen(true)}>
              + Milestone plan
            </Button>
            <Button
              onClick={() => {
                setEditingInvoice(undefined);
                setFormOpen(true);
              }}
            >
              + New invoice
            </Button>
          </div>
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
                  const reminderSuggestion = suggestReminderAction(invoice);
                  return (
                    <Tr key={invoice.Id}>
                      <Td className="font-medium text-slate-900">
                        {invoice.DocNumber ?? invoice.Id}
                        {invoice.MilestoneLabel ? (
                          <p className="mt-0.5 text-xs font-normal text-slate-500">Milestone: {invoice.MilestoneLabel}</p>
                        ) : null}
                      </Td>
                      <Td>{invoice.CustomerRef.name}</Td>
                      <Td>{formatDate(invoice.TxnDate)}</Td>
                      <Td>{formatDate(invoice.DueDate)}</Td>
                      <Td className="text-right">{formatCurrency(invoice.TotalAmt, invoice.CurrencyRef?.value)}</Td>
                      <Td className="text-right">{formatCurrency(invoice.Balance, invoice.CurrencyRef?.value)}</Td>
                      <Td>
                        {isPaid ? (
                          <Badge tone="success">Paid</Badge>
                        ) : isOverdue ? (
                          <Badge tone="danger">Overdue</Badge>
                        ) : (
                          <Badge tone="neutral">Open</Badge>
                        )}
                        {reminderSuggestion ? (
                          <p
                            className={`mt-1 text-xs ${
                              reminderSuggestion.recommended
                                ? `font-medium ${REMINDER_TONE_TEXT[reminderSuggestion.tone]}`
                                : 'text-slate-500'
                            }`}
                          >
                            {reminderSuggestion.label}
                          </p>
                        ) : null}
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
                          <Button size="sm" variant="ghost" onClick={() => setPaymentTarget(invoice)}>
                            {isPaid ? 'Payments' : 'Record payment'}
                          </Button>
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
                          <Button size="sm" variant="ghost" onClick={() => setDocumentsTarget(invoice)}>
                            Documents
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(invoice)}>
                            Delete
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
        homeCurrencyCode={homeCurrencyCode}
        onSaved={refresh}
      />

      <MilestonePlanDialog
        open={milestonePlanOpen}
        onClose={() => setMilestonePlanOpen(false)}
        customers={customers}
        products={products}
        onCreated={refresh}
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
            <strong>Amount due:</strong> {formatCurrency(sendTarget.Balance, sendTarget.CurrencyRef?.value)}
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
          onSuccess={() => {
            notify('Reminder sent.');
            refresh();
          }}
        >
          <p>
            <strong>To:</strong> {reminderTarget.BillEmail?.Address ?? reminderTarget.CustomerRef.name}
          </p>
          <p>
            <strong>Balance due:</strong> {formatCurrency(reminderTarget.Balance, reminderTarget.CurrencyRef?.value)}
          </p>
          {(() => {
            const suggestion = suggestReminderAction(reminderTarget);
            if (!suggestion) return null;
            return (
              <p className={suggestion.recommended ? `font-medium ${REMINDER_TONE_TEXT[suggestion.tone]}` : 'text-slate-500'}>
                {suggestion.label}
              </p>
            );
          })()}
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

      {deleteTarget ? (
        <DeleteInvoiceDialog invoice={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refresh} />
      ) : null}

      {paymentTarget ? (
        <RecordInvoicePaymentDialog
          invoice={paymentTarget}
          depositAccounts={depositAccounts}
          onClose={() => setPaymentTarget(null)}
          onChanged={handlePaymentsChanged}
        />
      ) : null}

      {documentsTarget ? (
        <DocumentsDialog
          entityType="invoice"
          entityId={documentsTarget.Id}
          title={documentsTarget.DocNumber ?? documentsTarget.Id}
          onClose={() => setDocumentsTarget(null)}
        />
      ) : null}

      {generalDocumentsOpen ? (
        <DocumentsDialog entityType="invoice" title="General" onClose={() => setGeneralDocumentsOpen(false)} />
      ) : null}
    </div>
  );
}
