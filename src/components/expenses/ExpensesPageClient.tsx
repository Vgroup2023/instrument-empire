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
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';
import { DeleteExpenseDialog } from '@/components/expenses/DeleteExpenseDialog';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Vendor } from '@/lib/accounting/vendors';
import type { GlAccount } from '@/lib/accounting/chartOfAccounts';
import type { Expense } from '@/lib/accounting/expenses';

export function ExpensesPageClient({
  initialExpenses,
  initialTotal,
  vendors,
  expenseAccounts,
  paymentAccounts,
}: {
  initialExpenses: Expense[];
  initialTotal: number;
  vendors: Vendor[];
  expenseAccounts: GlAccount[];
  paymentAccounts: GlAccount[];
}) {
  const list = usePagedList<Expense>('/api/expenses', 'expenses', initialExpenses, initialTotal);
  const expenses = list.items;
  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  async function refresh() {
    return list.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Money paid immediately — by card, cash, or check — as opposed to a bill owed for later."
        actions={
          <Button
            onClick={() => {
              setEditingExpense(undefined);
              setFormOpen(true);
            }}
          >
            + Record expense
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {expenses.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No expenses recorded yet" description="Record your first expense to get started." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>No.</Th>
                  <Th>Date</Th>
                  <Th>Vendor</Th>
                  <Th>Paid from</Th>
                  <Th>Method</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {expenses.map((expense) => (
                  <Tr key={expense.Id}>
                    <Td className="font-medium text-slate-900">{expense.DocNumber ?? expense.Id}</Td>
                    <Td>{formatDate(expense.TxnDate)}</Td>
                    <Td>{expense.EntityRef?.name ?? '—'}</Td>
                    <Td className="text-slate-500">{expense.AccountRef.name}</Td>
                    <Td>
                      <Badge tone="neutral">{expense.PaymentType}</Badge>
                    </Td>
                    <Td className="text-right">{formatCurrency(expense.TotalAmt)}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingExpense(expense);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(expense)}>
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        <LoadMoreBar shown={expenses.length} total={list.total} loading={list.loadingMore} onLoadMore={list.loadMore} noun="expenses" />
        </CardBody>
      </Card>

      <ExpenseFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        vendors={vendors}
        expenseAccounts={expenseAccounts}
        paymentAccounts={paymentAccounts}
        expense={editingExpense}
        onSaved={refresh}
      />

      {deleteTarget ? (
        <DeleteExpenseDialog expense={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refresh} />
      ) : null}
    </div>
  );
}
