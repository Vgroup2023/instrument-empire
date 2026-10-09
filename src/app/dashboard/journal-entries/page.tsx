import { PAGE_SIZE } from '@/lib/paging';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listJournalEntriesPage } from '@/lib/accounting/journalEntries';
import { listAccounts } from '@/lib/accounting/chartOfAccounts';
import { JournalEntriesPageClient } from '@/components/journal-entries/JournalEntriesPageClient';

export const dynamic = 'force-dynamic';

export default async function JournalEntriesPage() {
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
        <PageHeader
          title="Journal entries"
          description="Manual double-entry adjustments — accruals, corrections, depreciation, and the like."
        />
        <EmptyState
          title="Couldn't load journal entries"
          description={describeError(loadError, 'Please try again.')}
        />
      </div>
    );
  }

  return <JournalEntriesPageClient initialJournalEntries={data.journalEntries.items}
      initialTotal={data.journalEntries.total} accounts={data.accounts} />;
}

async function loadJournalEntriesData() {
  const [journalEntries, allAccounts] = await Promise.all([listJournalEntriesPage(PAGE_SIZE, 0), listAccounts()]);
  return { journalEntries, accounts: allAccounts.filter((a) => a.Active) };
}
