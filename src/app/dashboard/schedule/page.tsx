import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { addDays, dateInZone, weekStart } from '@/lib/workforce/time';
import { getSettings, listShifts, listStaff } from '@/lib/workforce/service';
import { ScheduleClient } from '@/components/workforce/ScheduleClient';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
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
        <PageHeader title="Scheduling" description="Plan who works when." />
        <EmptyState title="Couldn't load the schedule" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  return <ScheduleClient {...data} />;
}

async function load() {
  const settings = await getSettings();
  const today = dateInZone(new Date(), settings.timezone);
  const start = weekStart(today);
  const [shifts, staff] = await Promise.all([listShifts(start, addDays(start, 6)), listStaff()]);
  return { initialShifts: shifts, staff, today };
}
