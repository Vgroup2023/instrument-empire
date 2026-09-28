import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { listInvoices, listDepositAccounts } from '@/lib/accounting/invoices';
import { listCustomers } from '@/lib/accounting/customers';
import { listProducts } from '@/lib/accounting/products';
import { InvoicesPageClient } from '@/components/invoices/InvoicesPageClient';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  let data: Awaited<ReturnType<typeof loadInvoicesData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadInvoicesData();
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Invoices" description="Create, send, duplicate, and schedule customer invoices." />
        <EmptyState
          title="Couldn't load invoices"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
        />
      </div>
    );
  }

  return (
    <InvoicesPageClient
      initialInvoices={data.invoices}
      customers={data.customers}
      products={data.products}
      depositAccounts={data.depositAccounts}
      homeCurrencyCode="USD"
    />
  );
}

async function loadInvoicesData() {
  const [invoices, customers, products, depositAccounts] = await Promise.all([
    listInvoices(),
    listCustomers(),
    listProducts(),
    listDepositAccounts(),
  ]);
  return { invoices, customers, products, depositAccounts };
}
