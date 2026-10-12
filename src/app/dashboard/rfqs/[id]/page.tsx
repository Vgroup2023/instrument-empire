import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listCustomers } from '@/lib/accounting/customers';
import { getRfq } from '@/lib/quoting/service';
import { RfqDetailClient } from '@/components/rfqs/RfqDetailClient';

export const dynamic = 'force-dynamic';

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data: { rfq: Awaited<ReturnType<typeof getRfq>>; customers: Awaited<ReturnType<typeof listCustomers>> } | null = null;
  let loadError: unknown = null;
  try {
    const [rfq, customers] = await Promise.all([getRfq(id), listCustomers()]);
    data = { rfq, customers };
  } catch (err) {
    loadError = err;
  }
  if (!data) {
    return (
      <div>
        <PageHeader title="RFQ" description="Review a request and its quote." />
        <EmptyState title="Couldn't open this RFQ" description={describeError(loadError, 'It may have been removed.')} />
        <p className="mt-4 text-sm">
          <Link href="/dashboard/rfqs" className="text-brand-700 hover:underline">
            Back to RFQs
          </Link>
        </p>
      </div>
    );
  }
  return <RfqDetailClient initial={data.rfq} customers={data.customers.map((c) => ({ id: c.Id, name: c.DisplayName }))} />;
}
