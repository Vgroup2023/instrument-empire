import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { PAGE_SIZE } from '@/lib/paging';
import { listProductsPage, listIncomeAccounts } from '@/lib/accounting/products';
import { ProductsPageClient } from '@/components/products/ProductsPageClient';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  let data: { products: Awaited<ReturnType<typeof listProductsPage>>; incomeAccounts: Awaited<ReturnType<typeof listIncomeAccounts>> } | null = null;
  let loadError: unknown = null;
  try {
    const [products, incomeAccounts] = await Promise.all([listProductsPage(PAGE_SIZE, 0), listIncomeAccounts()]);
    data = { products, incomeAccounts };
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Products & services" description="What you sell — used as line items on invoices and estimates." />
        <EmptyState
          title="Couldn't load products & services"
          description={describeError(loadError, 'Please try again.')}
        />
      </div>
    );
  }

  return <ProductsPageClient initialProducts={data.products.items} initialTotal={data.products.total} incomeAccounts={data.incomeAccounts} />;
}
