import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { listVendors } from '@/lib/accounting/vendors';
import { VendorsPageClient } from '@/components/vendors/VendorsPageClient';

export const dynamic = 'force-dynamic';

const HOME_CURRENCY = { code: 'USD', name: 'US Dollar' };

export default async function VendorsPage() {
  let vendors: Awaited<ReturnType<typeof listVendors>> | null = null;
  let loadError: unknown = null;
  try {
    vendors = await listVendors();
  } catch (err) {
    loadError = err;
  }

  if (!vendors) {
    return (
      <div>
        <PageHeader title="Vendors" description="Everyone you owe money to, all in one place." />
        <EmptyState
          title="Couldn't load vendors"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
        />
      </div>
    );
  }

  return <VendorsPageClient initialVendors={vendors} currencies={[]} homeCurrency={HOME_CURRENCY} />;
}
