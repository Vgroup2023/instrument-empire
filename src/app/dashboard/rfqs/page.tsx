import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { PAGE_SIZE } from '@/lib/paging';
import { listCustomerOptions } from '@/lib/accounting/customers';
import { listRfqsPage, loadRules } from '@/lib/quoting/service';
import { RfqsPageClient } from '@/components/rfqs/RfqsPageClient';

export const dynamic = 'force-dynamic';

export default async function RfqsPage() {
  let data: { rfqs: Awaited<ReturnType<typeof listRfqsPage>>; customers: Awaited<ReturnType<typeof listCustomerOptions>>; rulesReady: boolean } | null = null;
  let loadError: unknown = null;
  try {
    const [rfqs, customers, rules] = await Promise.all([listRfqsPage(PAGE_SIZE, 0), listCustomerOptions(), loadRules()]);
    data = { rfqs, customers, rulesReady: rules.routing.length > 0 && rules.prices.length > 0 };
  } catch (err) {
    loadError = err;
  }
  if (!data) {
    return (
      <div>
        <PageHeader title="RFQs to quotes" description="Turn incoming requests for quote into costed quotes for estimator approval." />
        <EmptyState title="Couldn't load RFQs" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  return (
    <RfqsPageClient
      initialRfqs={data.rfqs.items}
      initialTotal={data.rfqs.total}
      customers={data.customers.map((c) => ({ id: c.Id, name: c.DisplayName }))}
      rulesReady={data.rulesReady}
    />
  );
}
