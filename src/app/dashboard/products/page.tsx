import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listProducts } from '@/lib/quickbooks/items';
import { ProductsPageClient } from '@/components/products/ProductsPageClient';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader title="Products & services" description="What you sell — used as line items on invoices and estimates." />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to manage products & services" />
      </div>
    );
  }

  const products = await listProducts();
  return <ProductsPageClient initialProducts={products} />;
}
