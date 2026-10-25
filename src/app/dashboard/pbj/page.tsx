import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { addDays, dateInZone } from '@/lib/workforce/time';
import { quarterOf, quarterRange, submissionDeadline } from '@/lib/workforce/pbj';
import { getSettings, pbjPreview } from '@/lib/workforce/service';
import { PbjClient } from '@/components/workforce/PbjClient';

export const dynamic = 'force-dynamic';

export default async function PbjPage() {
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
        <PageHeader title="Payroll Based Journal" description="The quarterly staffing report for CMS." />
        <EmptyState title="Couldn't load the report" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  return <PbjClient {...data} />;
}

async function load() {
  const settings = await getSettings();
  const today = dateInZone(new Date(), settings.timezone);
  const current = quarterOf(today);
  // For 45 days after a quarter ends it is still the one to send.
  const previous = quarterOf(addDays(quarterRange(current).start, -1));
  const quarter = today <= submissionDeadline(previous) ? previous : current;
  return { settings, initialPreview: await pbjPreview(quarter), today };
}
