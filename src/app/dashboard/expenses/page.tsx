import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listExpenses } from '@/lib/accounting/expenses';
import { listVendors } from '@/lib/accounting/vendors';
import { listExpenseAccounts, listPaymentAccounts } from '@/lib/accounting/chartOfAccounts';
import { ExpensesPageClient } from '@/components/expenses/ExpensesPageClient';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  let data: Awaited<ReturnType<typeof loadExpensesData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadExpensesData();
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader
          title="Expenses"
          description="Money paid immediately — by card, cash, or check — as opposed to a bill owed for later."
        />
        <EmptyState
          title="Couldn't load expenses"
          description={describeError(loadError, 'Please try again.')}
        />
      </div>
    );
  }

  return (
    <ExpensesPageClient
      initialExpenses={data.expenses}
      vendors={data.vendors}
      expenseAccounts={data.expenseAccounts}
      paymentAccounts={data.paymentAccounts}
    />
  );
}

async function loadExpensesData() {
  const [expenses, vendors, expenseAccounts, paymentAccounts] = await Promise.all([
    listExpenses(),
    listVendors(),
    listExpenseAccounts(),
    listPaymentAccounts(),
  ]);
  return { expenses, vendors, expenseAccounts, paymentAccounts };
}
