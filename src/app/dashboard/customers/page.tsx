import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listCustomers } from '@/lib/accounting/customers';
import { CustomersPageClient } from '@/components/customers/CustomersPageClient';

export const dynamic = 'force-dynamic';

const HOME_CURRENCY = { code: 'USD', name: 'US Dollar' };

export default async function CustomersPage() {
  let customers: Awaited<ReturnType<typeof listCustomers>> | null = null;
  let loadError: unknown = null;
  try {
    customers = await listCustomers();
  } catch (err) {
    loadError = err;
  }

  if (!customers) {
    return (
      <div>
        <PageHeader title="Customers" description="Everyone you bill, all in one place." />
        <EmptyState
          title="Couldn't load customers"
          description={describeError(loadError, 'Please try again.')}
        />
      </div>
    );
  }

  return <CustomersPageClient initialCustomers={customers} currencies={[]} homeCurrency={HOME_CURRENCY} />;
}
