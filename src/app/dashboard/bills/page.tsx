import { PAGE_SIZE } from '@/lib/paging';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listBillsPage } from '@/lib/accounting/bills';
import { listVendors } from '@/lib/accounting/vendors';
import { listExpenseAccounts, listBankAccounts } from '@/lib/accounting/chartOfAccounts';
import { BillsPageClient } from '@/components/bills/BillsPageClient';

export const dynamic = 'force-dynamic';

export default async function BillsPage() {
  let data: Awaited<ReturnType<typeof loadBillsData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadBillsData();
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Bills" description="Record what you owe vendors and pay them from here." />
        <EmptyState
          title="Couldn't load bills"
          description={describeError(loadError, 'Please try again.')}
        />
      </div>
    );
  }

  return (
    <BillsPageClient
      initialBills={data.bills.items}
      initialTotal={data.bills.total}
      vendors={data.vendors}
      expenseAccounts={data.expenseAccounts}
      bankAccounts={data.bankAccounts}
      homeCurrencyCode="USD"
    />
  );
}

async function loadBillsData() {
  const [bills, vendors, expenseAccounts, bankAccounts] = await Promise.all([
    listBillsPage(PAGE_SIZE, 0),
    listVendors(),
    listExpenseAccounts(),
    listBankAccounts(),
  ]);
  return { bills, vendors, expenseAccounts, bankAccounts };
}
