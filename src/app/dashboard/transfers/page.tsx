import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listTransfers } from '@/lib/quickbooks/transfers';
import { listPaymentAccounts } from '@/lib/quickbooks/accounts';
import { TransfersPageClient } from '@/components/transfers/TransfersPageClient';

export const dynamic = 'force-dynamic';

export default async function TransfersPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader title="Bank transfers" description="Move money between your own bank and credit card accounts." />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to manage transfers" />
      </div>
    );
  }

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
        <PageHeader title="Bank transfers" />
        <ConnectBanner />
        <EmptyState
          title="Couldn't load transfers"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
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
