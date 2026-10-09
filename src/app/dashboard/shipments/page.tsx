import { MAX_PAGE_SIZE, PAGE_SIZE } from '@/lib/paging';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { countShipments, listShipments } from '@/lib/agents/queries';
import { listCustomers } from '@/lib/accounting/customers';
import { ShipmentsPageClient } from '@/components/agents/ShipmentsPageClient';

export const dynamic = 'force-dynamic';

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ limit?: string }> }) {
  const { limit: rawLimit } = await searchParams;
  const limit = Math.min(Math.max(Math.trunc(Number(rawLimit)) || PAGE_SIZE, PAGE_SIZE), MAX_PAGE_SIZE);
  let data: [Awaited<ReturnType<typeof listShipments>>, Awaited<ReturnType<typeof listCustomers>>, number] | null = null;
  let loadError: unknown = null;
  try {
    data = await Promise.all([listShipments(limit), listCustomers(), countShipments()]);
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

  const [shipments, customers, total] = data;
  return <ShipmentsPageClient shipments={shipments} total={total} customers={customers.map((c) => ({ id: c.Id, name: c.DisplayName }))} />;
}
