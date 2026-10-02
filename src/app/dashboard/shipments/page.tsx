import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listShipments } from '@/lib/agents/queries';
import { listCustomers } from '@/lib/accounting/customers';
import { ShipmentsPageClient } from '@/components/agents/ShipmentsPageClient';

export const dynamic = 'force-dynamic';

export default async function ShipmentsPage() {
  let data: [Awaited<ReturnType<typeof listShipments>>, Awaited<ReturnType<typeof listCustomers>>] | null = null;
  let loadError: unknown = null;
  try {
    data = await Promise.all([listShipments(), listCustomers()]);
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Shipments" description="The files your agents watch." />
        <EmptyState title="Couldn't load shipments" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }

  const [shipments, customers] = data;
  return <ShipmentsPageClient shipments={shipments} customers={customers.map((c) => ({ id: c.Id, name: c.DisplayName }))} />;
}
