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

  try {
    const [estimates, customers, products] = await Promise.all([listEstimates(), listCustomers(), listProducts()]);
    return <EstimatesPageClient initialEstimates={estimates} customers={customers} products={products} />;
  } catch (err) {
    return (
      <div>
        <PageHeader title="Estimates" />
        <ConnectBanner />
        <EmptyState
          title="Couldn't load estimates"
          description={err instanceof Error ? err.message : 'Please try again.'}
        />
      </div>
    );
  }
}
