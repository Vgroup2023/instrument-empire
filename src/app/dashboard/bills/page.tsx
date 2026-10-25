import { PAGE_SIZE } from '@/lib/paging';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listBillsByStatus, billCounts } from '@/lib/accounting/bills';
import { listVendorOptions } from '@/lib/accounting/vendors';
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
      initialCounts={data.counts}
      vendors={data.vendors}
      expenseAccounts={data.expenseAccounts}
      bankAccounts={data.bankAccounts}
      homeCurrencyCode="USD"
    />
  );
}

async function loadBillsData() {
  const [bills, counts, vendors, expenseAccounts, bankAccounts] = await Promise.all([
    // Opens on what still needs paying; "All" is one click away.
    listBillsByStatus('unpaid', PAGE_SIZE, 0),
    billCounts(),
    listVendorOptions(),
    listExpenseAccounts(),
    listBankAccounts(),
  ]);
  return { bills, counts, vendors, expenseAccounts, bankAccounts };
}
