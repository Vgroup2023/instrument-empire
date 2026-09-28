import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listEstimates } from '@/lib/quickbooks/estimates';
import { listCustomers } from '@/lib/quickbooks/customers';
import { listProducts } from '@/lib/quickbooks/items';
import { EstimatesPageClient } from '@/components/estimates/EstimatesPageClient';

export const dynamic = 'force-dynamic';

export default async function EstimatesPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader title="Estimates" description="Create, send, duplicate, and schedule customer estimates." />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to manage estimates" />
      </div>
    );
  }

  let data: Awaited<ReturnType<typeof loadEstimatesData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadEstimatesData();
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Estimates" />
        <ConnectBanner />
        <EmptyState
          title="Couldn't load estimates"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
        />
      </div>
    );
  }

  return (
    <EstimatesPageClient
      initialEstimates={data.estimates}
      customers={data.customers}
      products={data.products}
    />
  );
}

async function loadEstimatesData() {
  const [estimates, customers, products] = await Promise.all([listEstimates(), listCustomers(), listProducts()]);
  return { estimates, customers, products };
}
