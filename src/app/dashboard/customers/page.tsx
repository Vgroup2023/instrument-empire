import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listCustomers } from '@/lib/quickbooks/customers';
import { loadCurrencies } from '@/lib/quickbooks/currencies';
import { CustomersPageClient } from '@/components/customers/CustomersPageClient';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader title="Customers" description="Everyone you bill, all in one place." />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to manage customers" />
      </div>
    );
  }

  const [customers, { currencies, homeCurrency }] = await Promise.all([listCustomers(), loadCurrencies()]);
  return <CustomersPageClient initialCustomers={customers} currencies={currencies} homeCurrency={homeCurrency} />;
}
