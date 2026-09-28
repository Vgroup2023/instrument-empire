import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listInvoices } from '@/lib/quickbooks/invoices';
import { listCustomers } from '@/lib/quickbooks/customers';
import { listProducts } from '@/lib/quickbooks/items';
import { InvoicesPageClient } from '@/components/invoices/InvoicesPageClient';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader title="Invoices" description="Create, send, duplicate, and schedule customer invoices." />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to manage invoices" />
      </div>
    );
  }

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
        <PageHeader title="Invoices" />
        <ConnectBanner />
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
    />
  );
}

async function loadInvoicesData() {
  const [invoices, customers, products] = await Promise.all([listInvoices(), listCustomers(), listProducts()]);
  return { invoices, customers, products };
}
