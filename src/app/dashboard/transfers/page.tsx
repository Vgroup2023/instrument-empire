import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listTransfers } from '@/lib/accounting/transfers';
import { listPaymentAccounts } from '@/lib/accounting/chartOfAccounts';
import { TransfersPageClient } from '@/components/transfers/TransfersPageClient';

export const dynamic = 'force-dynamic';

export default async function TransfersPage() {
  let data: Awaited<ReturnType<typeof loadTransfersData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadTransfersData();
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Bank transfers" description="Move money between your own bank and credit card accounts." />
        <EmptyState
          title="Couldn't load transfers"
          description={describeError(loadError, 'Please try again.')}
        />
      </div>
    );
  }

  return <TransfersPageClient initialTransfers={data.transfers} accounts={data.accounts} />;
}

async function loadTransfersData() {
  const [transfers, accounts] = await Promise.all([listTransfers(), listPaymentAccounts()]);
  return { transfers, accounts };
}
