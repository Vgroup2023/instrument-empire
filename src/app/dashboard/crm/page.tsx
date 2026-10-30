import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { snapshot } from '@/lib/crm/service';
import { CrmClient } from '@/components/crm/CrmClient';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  let initial: Awaited<ReturnType<typeof snapshot>> | null = null;
  let loadError: unknown = null;
  try {
    initial = await snapshot();
  } catch (err) {
    loadError = err;
  }
  if (!initial) {
    return (
      <div>
        <PageHeader title="CRM" description="Leads, deals and every call, email and meeting, recorded as it happens." />
        <EmptyState title="Couldn't load the CRM" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  return <CrmClient initial={initial} />;
}
