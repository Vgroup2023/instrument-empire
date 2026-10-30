import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getCurrentUser } from '@/lib/auth/current';
import { listUsers } from '@/lib/auth/service';
import { describeError } from '@/lib/errors';
import { TeamClient } from '@/components/team/TeamClient';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/dashboard/team');
  let users: Awaited<ReturnType<typeof listUsers>> | null = null;
  let loadError: unknown = null;
  try {
    const all = await listUsers();
    users = me.role === 'manager' ? all.filter((u) => u.departments.some((d) => me.departments.includes(d))) : all;
  } catch (err) {
    loadError = err;
  }
  return (
    <div>
      <PageHeader title="Team & access" description="Add your people, give each a role and the departments they work in, and switch anyone off. Everyone signs in with their own email and password." />
      {users ? (
        <TeamClient initial={users} me={{ id: me.id, name: me.name, role: me.role, departments: me.departments, legacy: me.legacy }} />
      ) : (
        <EmptyState title="Couldn't load the team" description={describeError(loadError, 'Please try again.')} />
      )}
    </div>
  );
}
