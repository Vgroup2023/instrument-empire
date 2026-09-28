import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listJournalEntries } from '@/lib/quickbooks/journalEntries';
import { listAccounts } from '@/lib/quickbooks/chartOfAccounts';
import { JournalEntriesPageClient } from '@/components/journal-entries/JournalEntriesPageClient';

export const dynamic = 'force-dynamic';

export default async function JournalEntriesPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader
          title="Journal entries"
          description="Manual double-entry adjustments — accruals, corrections, depreciation, and the like."
        />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to manage journal entries" />
      </div>
    );
  }

  let data: Awaited<ReturnType<typeof loadJournalEntriesData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadJournalEntriesData();
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Journal entries" />
        <ConnectBanner />
        <EmptyState
          title="Couldn't load journal entries"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
        />
      </div>
    );
  }

  return <JournalEntriesPageClient initialJournalEntries={data.journalEntries} accounts={data.accounts} />;
}

async function loadJournalEntriesData() {
  const [journalEntries, allAccounts] = await Promise.all([listJournalEntries(), listAccounts()]);
  return { journalEntries, accounts: allAccounts.filter((a) => a.Active) };
}
