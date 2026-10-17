import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { PAGE_SIZE } from '@/lib/paging';
import { listVendorsPage } from '@/lib/accounting/vendors';
import { VendorsPageClient } from '@/components/vendors/VendorsPageClient';

export const dynamic = 'force-dynamic';

const HOME_CURRENCY = { code: 'USD', name: 'US Dollar' };

export default async function VendorsPage() {
  let vendors: Awaited<ReturnType<typeof listVendorsPage>> | null = null;
  let loadError: unknown = null;
  try {
    vendors = await listVendorsPage(PAGE_SIZE, 0);
  } catch (err) {
    loadError = err;
  }

  if (!vendors) {
    return (
      <div>
        <PageHeader title="Vendors" description="Everyone you owe money to, all in one place." />
        <EmptyState
          title="Couldn't load vendors"
          description={describeError(loadError, 'Please try again.')}
        />
      </div>
    );
  }

  return <VendorsPageClient initialVendors={vendors.items} initialTotal={vendors.total} currencies={[]} homeCurrency={HOME_CURRENCY} />;
}
