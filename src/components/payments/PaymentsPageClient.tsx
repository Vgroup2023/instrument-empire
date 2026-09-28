'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Label, Input } from '@/components/ui/Field';
import { CustomerSelect } from '@/components/documents/CustomerSelect';
import { ConfirmSendDialog } from '@/components/ui/ConfirmSendDialog';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Customer } from '@/lib/quickbooks/customers';
import type { PaymentLink } from '@/lib/quickbooks/payments';
import type { Invoice } from '@/lib/quickbooks/invoices';

const statusTone: Record<PaymentLink['status'], 'neutral' | 'success' | 'warning' | 'danger' | 'brand'> = {
  active: 'neutral',
  sent: 'brand',
  paid: 'success',
  expired: 'danger',
};

export function PaymentsPageClient({
  customers,
  initialLinks,
  overdueInvoices,
  isDemoPayments,
}: {
  customers: Customer[];
  initialLinks: PaymentLink[];
  overdueInvoices: Invoice[];
  isDemoPayments: boolean;
}) {
  const { notify } = useToast();
  const [links, setLinks] = useState(initialLinks);
  const [createOpen, setCreateOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<PaymentLink | null>(null);
  const [reminderTarget, setReminderTarget] = useState<Invoice | null>(null);

  async function refreshLinks() {
    const res = await fetch('/api/payments/links', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setLinks(data.links);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, customerName, email: email || undefined, amount: Number(amount), description: description || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to create payment link.');
      }
      notify('Payment link created.');
      setCreateOpen(false);
      setCustomerId('');
      setAmount('');
      setDescription('');
      refreshLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Payment links & reminders"
        description="Get paid faster — send a payment link, or nudge customers with overdue balances."
        actions={<Button onClick={() => setCreateOpen(true)}>+ New payment link</Button>}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Payment links</CardTitle>
            <CardDescription>
              {isDemoPayments
                ? "Demo mode — these links are not real and won't be emailed to anyone. QuickBooks Payments product access isn't wired up yet (see Settings)."
                : 'Create a link and email it to get paid directly.'}
            </CardDescription>
          </div>
        </CardHeader>
        {isDemoPayments ? (
          <div className="border-b border-gold-200 bg-gold-50 px-5 py-2.5 text-sm text-gold-900">
            ⚠️ Demo mode: payment links here are placeholders. Sending one only updates its status in
            this app — it does <strong>not</strong> email the customer or process any payment.
          </div>
        ) : null}
        <CardBody className="p-0">
          {links.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No payment links yet" description="Create one for a customer who wants to pay you directly." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Customer</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Link</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {links.map((link) => (
                  <Tr key={link.id}>
                    <Td className="font-medium text-slate-900">{link.customerName}</Td>
                    <Td className="text-right">{formatCurrency(link.amount)}</Td>
                    <Td>
                      <Badge tone={statusTone[link.status]}>{link.status}</Badge>
                    </Td>
                    <Td className="max-w-[220px] truncate text-xs text-slate-500">{link.url}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSendTarget(link)}>
                        Send
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Overdue invoices</CardTitle>
            <CardDescription>Send a friendly reminder for balances past their due date.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {overdueInvoices.length === 0 ? (
            <div className="p-6">
              <EmptyState title="Nothing overdue" description="You're all caught up." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Invoice</Th>
                  <Th>Customer</Th>
                  <Th>Due date</Th>
                  <Th className="text-right">Balance</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {overdueInvoices.map((invoice) => (
                  <Tr key={invoice.Id}>
                    <Td className="font-medium text-slate-900">{invoice.DocNumber ?? invoice.Id}</Td>
                    <Td>{invoice.CustomerRef.name}</Td>
                    <Td>{formatDate(invoice.DueDate)}</Td>
                    <Td className="text-right">{formatCurrency(invoice.Balance)}</Td>
                    <Td className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => setReminderTarget(invoice)}>
                        Send reminder
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create a payment link">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <Label htmlFor="customer">Customer</Label>
            <CustomerSelect
              customers={customers}
              value={customerId}
              onChange={(id, name, defaultEmail) => {
                setCustomerId(id);
                setCustomerName(name);
                if (defaultEmail && !email) setEmail(defaultEmail);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="description">What&apos;s it for? (optional)</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create link
            </Button>
          </div>
        </form>
      </Modal>

      {sendTarget ? (
        <ConfirmSendDialog
          open={Boolean(sendTarget)}
          onClose={() => setSendTarget(null)}
          title="Send payment link"
          confirmLabel={isDemoPayments ? 'Mark as sent (demo)' : 'Send link'}
          onConfirm={async () => {
            const res = await fetch(`/api/payments/links/${sendTarget.id}/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? 'Failed to send payment link.');
            }
          }}
          onSuccess={() => {
            notify(
              isDemoPayments
                ? 'Marked as sent — this is demo mode, so no email actually went out.'
                : 'Payment link sent.',
            );
            refreshLinks();
          }}
        >
          {isDemoPayments ? (
            <p className="mb-3 rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-gold-900">
              ⚠️ Demo mode — clicking confirm will <strong>not</strong> email this customer or process a
              real payment. It only updates the link&apos;s status here.
            </p>
          ) : null}
          <p>
            <strong>To:</strong> {sendTarget.email ?? sendTarget.customerName}
          </p>
          <p>
            <strong>Amount:</strong> {formatCurrency(sendTarget.amount)}
          </p>
          <p>
            <strong>Link:</strong> {sendTarget.url}
          </p>
        </ConfirmSendDialog>
      ) : null}

      {reminderTarget ? (
        <ConfirmSendDialog
          open={Boolean(reminderTarget)}
          onClose={() => setReminderTarget(null)}
          title={`Send a reminder for invoice ${reminderTarget.DocNumber ?? ''}`}
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
          <p>
            <strong>Due date:</strong> {formatDate(reminderTarget.DueDate)}
          </p>
        </ConfirmSendDialog>
      ) : null}
    </div>
  );
}
