import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { listEstimates } from '@/lib/accounting/estimates';
import { listCustomers } from '@/lib/accounting/customers';
import { listProducts } from '@/lib/accounting/products';
import { EstimatesPageClient } from '@/components/estimates/EstimatesPageClient';

export const dynamic = 'force-dynamic';

export default async function EstimatesPage() {
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
        <PageHeader title="Estimates" description="Create, send, duplicate, and schedule customer estimates." />
        <EmptyState
          title="Couldn't load estimates"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
        />
      </div>
    );
  }

  return <EstimatesPageClient initialEstimates={data.estimates} customers={data.customers} products={data.products} />;
}

async function loadEstimatesData() {
  const [estimates, customers, products] = await Promise.all([listEstimates(), listCustomers(), listProducts()]);
  return { estimates, customers, products };
}
