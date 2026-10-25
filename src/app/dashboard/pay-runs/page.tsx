import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listAccounts } from '@/lib/accounting/chartOfAccounts';
import { getPaySettings, listPayProfiles, listRuns, taxSummary } from '@/lib/payroll/service';
import { PayRunsClient } from '@/components/payroll/PayRunsClient';

export const dynamic = 'force-dynamic';

export default async function PayRunsPage() {
  let data: Awaited<ReturnType<typeof load>> | null = null;
  let loadError: unknown = null;
  try {
    data = await load();
  } catch (err) {
    loadError = err;
  }
  if (!data) {
    return (
      <div>
        <PageHeader title="Pay runs" description="Pay your employees and see what you owe in payroll taxes." />
        <EmptyState title="Couldn't load pay runs" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  return <PayRunsClient {...data} />;
}

async function load() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  const [runs, profiles, settings, accounts, summary] = await Promise.all([listRuns(), listPayProfiles(), getPaySettings(), listAccounts(), taxSummary(year, quarter)]);
  const slim = accounts.filter((a) => a.Active).map((a) => ({ id: a.Id, name: a.Name, type: a.AccountType }));
  return { runs, profiles, settings, accounts: slim, summary, today: now.toISOString().slice(0, 10) };
}
