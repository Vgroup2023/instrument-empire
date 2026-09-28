import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listExpenses } from '@/lib/quickbooks/expenses';
import { listVendors } from '@/lib/quickbooks/vendors';
import { listExpenseAccounts, listPaymentAccounts } from '@/lib/quickbooks/accounts';
import { ExpensesPageClient } from '@/components/expenses/ExpensesPageClient';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader
          title="Expenses"
          description="Money paid immediately — by card, cash, or check — as opposed to a bill owed for later."
        />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to manage expenses" />
      </div>
    );
  }

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
        <PageHeader title="Expenses" />
        <ConnectBanner />
        <EmptyState
          title="Couldn't load expenses"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
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
