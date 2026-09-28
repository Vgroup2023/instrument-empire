import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listBills } from '@/lib/quickbooks/bills';
import { listVendors } from '@/lib/quickbooks/vendors';
import { listExpenseAccounts, listBankAccounts } from '@/lib/quickbooks/accounts';
import { loadCurrencies } from '@/lib/quickbooks/currencies';
import { BillsPageClient } from '@/components/bills/BillsPageClient';

export const dynamic = 'force-dynamic';

export default async function BillsPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader title="Bills" description="Record what you owe vendors and pay them from here." />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to manage bills" />
      </div>
    );
  }

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
        <PageHeader title="Bills" />
        <ConnectBanner />
        <EmptyState
          title="Couldn't load bills"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
        />
      </div>
    );
  }

  return (
    <BillsPageClient
      initialBills={data.bills}
      vendors={data.vendors}
      expenseAccounts={data.expenseAccounts}
      bankAccounts={data.bankAccounts}
      homeCurrencyCode={data.homeCurrency?.code}
    />
  );
}

async function loadBillsData() {
  const [bills, vendors, expenseAccounts, bankAccounts, { homeCurrency }] = await Promise.all([
    listBills(),
    listVendors(),
    listExpenseAccounts(),
    listBankAccounts(),
    loadCurrencies(),
  ]);
  return { bills, vendors, expenseAccounts, bankAccounts, homeCurrency };
}
