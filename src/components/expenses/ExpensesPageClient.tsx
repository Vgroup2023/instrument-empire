'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ExpenseFormDialog } from '@/components/expenses/ExpenseFormDialog';
import { DeleteExpenseDialog } from '@/components/expenses/DeleteExpenseDialog';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Vendor } from '@/lib/quickbooks/vendors';
import type { GlAccount } from '@/lib/quickbooks/accounts';
import type { Expense } from '@/lib/quickbooks/expenses';

export function ExpensesPageClient({
  initialExpenses,
  vendors,
  expenseAccounts,
  paymentAccounts,
}: {
  initialExpenses: Expense[];
  vendors: Vendor[];
  expenseAccounts: GlAccount[];
  paymentAccounts: GlAccount[];
}) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  async function refresh() {
    const res = await fetch('/api/expenses', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setExpenses(data.expenses);
    }
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Money paid immediately — by card, cash, or check — as opposed to a bill owed for later."
        actions={<Button onClick={() => setFormOpen(true)}>+ Record expense</Button>}
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
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(expense)}>
                        Delete
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <ExpenseFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        vendors={vendors}
        expenseAccounts={expenseAccounts}
        paymentAccounts={paymentAccounts}
        onSaved={refresh}
      />

      {deleteTarget ? (
        <DeleteExpenseDialog expense={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={refresh} />
      ) : null}
    </div>
  );
}
