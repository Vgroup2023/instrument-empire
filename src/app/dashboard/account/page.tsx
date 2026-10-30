import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { getCurrentUser } from '@/lib/auth/current';
import { DEPARTMENTS, departmentName, roleName, effectiveDepartments } from '@/lib/auth/permissions';
import { PasswordChangeForm } from '@/components/team/PasswordChangeForm';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/dashboard/account');
  const depts = effectiveDepartments(me);
  return (
    <div>
      <PageHeader title="My account" description="Who you are signed in as, what you can open, and your password." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>You</CardTitle></CardHeader>
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-xs text-slate-500">Name</dt><dd className="font-medium text-slate-900">{me.name}</dd></div>
              <div><dt className="text-xs text-slate-500">Email</dt><dd className="font-medium text-slate-900">{me.email ?? 'Shared passphrase (no personal account yet)'}</dd></div>
              <div><dt className="text-xs text-slate-500">Role</dt><dd className="font-medium text-slate-900">{roleName(me.role)}</dd></div>
              <div>
                <dt className="text-xs text-slate-500">Departments</dt>
                <dd className="font-medium text-slate-900">{depts.length === DEPARTMENTS.length ? 'All departments' : depts.map(departmentName).join(', ') || 'None yet'}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
          <CardBody>
            {me.id ? <PasswordChangeForm /> : <p className="text-sm text-slate-600">You are signed in with the shared passphrase. Open <b>Team &amp; access</b> to create your own owner account first.</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
