'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { BillFormDialog } from '@/components/bills/BillFormDialog';
import { PayBillDialog } from '@/components/bills/PayBillDialog';
import { ApproveBillDialog } from '@/components/bills/ApproveBillDialog';
import { DeleteBillDialog } from '@/components/bills/DeleteBillDialog';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Vendor } from '@/lib/accounting/vendors';
import type { GlAccount } from '@/lib/accounting/chartOfAccounts';
import type { Bill } from '@/lib/accounting/bills';

export function BillsPageClient({
  initialBills,
  vendors,
  expenseAccounts,
  bankAccounts,
  homeCurrencyCode,
}: {
  initialBills: Bill[];
  vendors: Vendor[];
  expenseAccounts: GlAccount[];
  bankAccounts: GlAccount[];
  homeCurrencyCode?: string;
}) {
  const { notify } = useToast();
  const [bills, setBills] = useState(initialBills);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | undefined>(undefined);
  const [payTarget, setPayTarget] = useState<Bill | null>(null);
  const [approveTarget, setApproveTarget] = useState<Bill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bill | null>(null);
  const [unapprovingId, setUnapprovingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/bills', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setBills(data.bills);
    }
  }

  async function handleDuplicate(bill: Bill) {
    try {
      const res = await fetch(`/api/bills/${bill.Id}/duplicate`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to duplicate bill.');
      }
      notify('Bill duplicated as a new draft.');
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to duplicate bill.', 'error');
    }
  }

  async function handleUnapprove(bill: Bill) {
    setUnapprovingId(bill.Id);
    try {
      const res = await fetch(`/api/bills/${bill.Id}/approve`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to revoke approval.');
      }
      notify('Approval revoked.');
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
    } finally {
      setUnapprovingId(null);
    }
  }

  const unpaidBills = bills.filter((b) => b.Balance > 0);
  const awaitingApprovalCount = unpaidBills.filter((b) => !b.Approved).length;
  const scheduledToPayCount = unpaidBills.filter((b) => b.Approved && b.ScheduledPaymentDate).length;

  return (
    <div>
      <PageHeader
        title="Bills"
        description="Record what you owe vendors and pay them from here. Approve a bill before it can be paid, optionally with a planned pay date."
        actions={
          <Button
            onClick={() => {
              setEditingBill(undefined);
              setFormOpen(true);
            }}
          >
            + Record bill
          </Button>
        }
      />

      {bills.length > 0 ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Awaiting approval" value={String(awaitingApprovalCount)} />
          <StatCard label="Approved & scheduled" value={String(scheduledToPayCount)} />
        </div>
      ) : null}

      <Card>
        <CardBody className="p-0">
          {bills.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No bills yet" description="Record your first bill to start tracking what you owe." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>No.</Th>
                  <Th>Vendor</Th>
                  <Th>Date</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Balance</Th>
                  <Th>Approval</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {bills.map((bill) => {
                  const isPaid = bill.Balance === 0;
                  const isOverdue = !isPaid && bill.DueDate && new Date(bill.DueDate) < new Date();
                  return (
                    <Tr key={bill.Id}>
                      <Td className="font-medium text-slate-900">{bill.DocNumber ?? bill.Id}</Td>
                      <Td>{bill.VendorRef.name}</Td>
                      <Td>{formatDate(bill.TxnDate)}</Td>
                      <Td>{formatDate(bill.DueDate)}</Td>
                      <Td className="text-right">{formatCurrency(bill.TotalAmt, bill.CurrencyRef?.value)}</Td>
                      <Td className="text-right">{formatCurrency(bill.Balance, bill.CurrencyRef?.value)}</Td>
                      <Td>
                        {isPaid ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div>
                            <Badge tone={bill.Approved ? 'success' : 'warning'}>
                              {bill.Approved ? 'Approved' : 'Pending approval'}
                            </Badge>
                            {bill.ScheduledPaymentDate ? (
                              <p className="mt-1 text-xs text-slate-500">
                                Scheduled: {formatDate(bill.ScheduledPaymentDate)}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </Td>
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
                          {!isPaid && !bill.Approved ? (
                            <Button size="sm" variant="ghost" onClick={() => setApproveTarget(bill)}>
                              Approve
                            </Button>
                          ) : null}
                          {!isPaid && bill.Approved ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setPayTarget(bill)}>
                                Pay
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={unapprovingId === bill.Id}
                                onClick={() => handleUnapprove(bill)}
                              >
                                Revoke approval
                              </Button>
                            </>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingBill(bill);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDuplicate(bill)}>
                            Duplicate
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(bill)}>
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

      <BillFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        vendors={vendors}
        expenseAccounts={expenseAccounts}
        bill={editingBill}
        onSaved={refresh}
      />

      {payTarget ? (
        <PayBillDialog bill={payTarget} bankAccounts={bankAccounts} onClose={() => setPayTarget(null)} onPaid={refresh} />
      ) : null}

      {approveTarget ? (
        <ApproveBillDialog bill={approveTarget} onClose={() => setApproveTarget(null)} onApproved={refresh} />
      ) : null}

      {deleteTarget ? (
        <DeleteBillDialog bill={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refresh} />
      ) : null}
    </div>
  );
}
