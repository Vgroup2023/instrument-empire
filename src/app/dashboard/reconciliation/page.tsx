import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listPaymentAccounts } from '@/lib/accounting/chartOfAccounts';
import { ReconciliationClient } from '@/components/reconciliation/ReconciliationClient';

export const dynamic = 'force-dynamic';

export default async function ReconciliationPage() {
  let accounts: Awaited<ReturnType<typeof listPaymentAccounts>> = [];
  let error: string | null = null;

  try {
    accounts = await listPaymentAccounts();
  } catch (err) {
    error = describeError(err, 'Failed to load bank/credit card accounts.');
  }

  return (
    <div>
      <PageHeader
        title="Reconciliation"
        description="Upload a bank or credit card statement (CSV export) and match it against what's recorded in this account. This app has no live bank connection, so a statement export is the way in — matching is by amount and nearby date, not AI, and nothing is saved: each upload is a one-time comparison."
      />
      {error ? (
        <EmptyState title="Couldn't load accounts" description={error} />
      ) : (
        <ReconciliationClient accounts={accounts} />
      )}
    </div>
  );
}
