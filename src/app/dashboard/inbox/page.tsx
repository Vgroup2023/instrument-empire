import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getCurrentUser } from '@/lib/auth/current';
import { listTasks } from '@/lib/team/tasks';
import { describeError } from '@/lib/errors';
import { InboxClient } from '@/components/team/InboxClient';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/dashboard/inbox');
  let initial: Awaited<ReturnType<typeof listTasks>> | null = null;
  let loadError: unknown = null;
  try {
    initial = await listTasks(me, 'inbox');
  } catch (err) {
    loadError = err;
  }
  return (
    <div>
      <PageHeader title="Team inbox" description="Work handed to you or your department by other teams or by the app itself, and work you have handed on." />
      {initial ? <InboxClient initial={initial} readOnly={me.role === 'viewer'} /> : <EmptyState title="Couldn't load the inbox" description={describeError(loadError, 'Please try again.')} />}
    </div>
  );
}
