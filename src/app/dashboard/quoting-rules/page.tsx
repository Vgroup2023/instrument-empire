import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { loadRulesView } from '@/lib/quoting/service';
import { QuotingRulesClient } from '@/components/rfqs/QuotingRulesClient';

export const dynamic = 'force-dynamic';

export default async function QuotingRulesPage() {
  let rules: Awaited<ReturnType<typeof loadRulesView>> | null = null;
  let loadError: unknown = null;
  try {
    rules = await loadRulesView();
  } catch (err) {
    loadError = err;
  }
  if (!rules) {
    return (
      <div>
        <PageHeader title="Quoting rules" description="The prices, routing and history behind every quote." />
        <EmptyState title="Couldn't load the rules" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  return <QuotingRulesClient initial={rules} today={new Date().toISOString().slice(0, 10)} />;
}
