import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { deskOverview, type DeskOverview } from '@/lib/desk/queries';
import { OrderDeskClient } from '@/components/desk/OrderDeskClient';

export const dynamic = 'force-dynamic';

export default async function OrderDeskPage() {
  let data: DeskOverview | null = null;
  let loadError: unknown = null;
  try {
    data = await deskOverview();
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Order desk" description="Order intake, customer service, order processing and shipping." />
        <EmptyState title="Couldn't load the order desk" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  return <OrderDeskClient data={data} generatedAt={new Date().toISOString()} />;
}
