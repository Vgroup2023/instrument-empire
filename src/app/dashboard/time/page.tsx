import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { dateInZone } from '@/lib/workforce/time';
import { getSettings, listStaff, listEntries, listTimeOff, weekTimesheet } from '@/lib/workforce/service';
import { addDays, weekStart } from '@/lib/workforce/time';
import { TimeClient } from '@/components/workforce/TimeClient';

export const dynamic = 'force-dynamic';

export default async function TimePage() {
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
        <PageHeader title="Time & attendance" description="Timesheets, time off and staff clock setup." />
        <EmptyState title="Couldn't load time & attendance" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  return <TimeClient {...data} />;
}

async function load() {
  const settings = await getSettings();
  const today = dateInZone(new Date(), settings.timezone);
  const start = weekStart(today);
  const [sheet, entries, staff, timeOff] = await Promise.all([
    weekTimesheet(today),
    listEntries(start, addDays(start, 6)),
    listStaff(),
    listTimeOff(addDays(start, -30), addDays(start, 60)),
  ]);
  return { initialSheet: sheet, initialEntries: entries, staff, initialTimeOff: timeOff, today };
}
