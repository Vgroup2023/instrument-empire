import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listPaymentAccounts } from '@/lib/accounting/chartOfAccounts';
import { BookkeepingClient } from '@/components/bookkeeping/BookkeepingClient';

export const dynamic = 'force-dynamic';

export default async function BookkeepingPage() {
  let accounts: Awaited<ReturnType<typeof listPaymentAccounts>> = [];
  let error: string | null = null;
  try {
    accounts = await listPaymentAccounts();
  } catch (err) {
    error = describeError(err, 'Failed to load bank and credit card accounts.');
  }
  return (
    <div>
      <PageHeader
        title="AI bookkeeping"
        description="Upload a bank or card statement and the copilot matches each line to what is already booked, suggests an account for the rest from your rules, your past approvals and (with an Anthropic key) Claude, and lines up what needs you. Nothing is booked until you approve it, or a rule you chose to auto-post fires."
      />
      {error ? <EmptyState title="Couldn't load accounts" description={error} /> : <BookkeepingClient accounts={accounts} />}
    </div>
  );
}
