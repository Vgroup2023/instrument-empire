import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { listAccounts } from '@/lib/accounting/chartOfAccounts';
import { AccountsPageClient } from '@/components/accounts/AccountsPageClient';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  let accounts: Awaited<ReturnType<typeof listAccounts>> | null = null;
  let loadError: unknown = null;
  try {
    accounts = await listAccounts();
  } catch (err) {
    loadError = err;
  }

  if (!accounts) {
    return (
      <div>
        <PageHeader
          title="Chart of accounts"
          description="Every account in your books — bank, income, expense, and everything between."
        />
        <EmptyState
          title="Couldn't load accounts"
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
        />
      </div>
    );
  }

  return <AccountsPageClient initialAccounts={accounts} />;
}
