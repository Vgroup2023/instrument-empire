'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardBody } from '@/components/ui/Card';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Label, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate, initials } from '@/lib/format';
import type { Employee, PayrollSummary } from '@/lib/quickbooks/payroll';

const statusTone: Record<Employee['status'], 'success' | 'danger' | 'warning'> = {
  active: 'success',
  terminated: 'danger',
  pending: 'warning',
};

const statusLabel: Record<Employee['status'], string> = {
  active: 'Hired · Active',
  terminated: 'Terminated',
  pending: 'Pending start',
};

function payLabel(employee: Employee): string {
  return employee.basePay.period === 'hourly'
    ? `${formatCurrency(employee.basePay.amount)}/hr`
    : `${formatCurrency(employee.basePay.amount)}/yr`;
}

export function PayrollPageClient({
  initialEmployees,
  summary,
}: {
  initialEmployees: Employee[];
  summary: PayrollSummary;
}) {
  const { notify } = useToast();
  const [employees, setEmployees] = useState(initialEmployees);
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);
  const [payEmployee, setPayEmployee] = useState<Employee | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function refresh() {
    const res = await fetch('/api/payroll/employees', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setEmployees(data.employees);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Payroll"
        description="Read-only payroll answers, plus the ability to add employees and set base pay."
        actions={<Button onClick={() => setAddOpen(true)}>+ Add employee</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total employees" value={String(summary.totalEmployees)} />
        <StatCard label="Active employees" value={String(summary.activeEmployees)} />
        <StatCard
          label="Last payroll run"
          value={formatDate(summary.lastPayrollRunDate)}
          hint={formatCurrency(summary.lastPayrollGross) + ' gross'}
        />
        <StatCard label="Next payroll date" value={formatDate(summary.nextPayrollDate)} />
      </div>

      <Card>
        <CardBody className="p-0">
          <Table>
            <Thead>
              <Tr>
                <Th>Employee</Th>
                <Th>Role</Th>
                <Th>Hired</Th>
                <Th>Status</Th>
                <Th className="text-right">Base pay</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {employees.map((employee) => (
                <Tr key={employee.id}>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                        {initials(employee.displayName)}
                      </span>
                      <div>
                        <p className="font-medium text-slate-900">{employee.displayName}</p>
                        {employee.email ? <p className="text-xs text-slate-500">{employee.email}</p> : null}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    {employee.jobTitle}
                    {employee.department ? <span className="text-slate-400"> · {employee.department}</span> : null}
                  </Td>
                  <Td>{formatDate(employee.hiredDate)}</Td>
                  <Td>
                    <Badge tone={statusTone[employee.status]}>{statusLabel[employee.status]}</Badge>
                  </Td>
                  <Td className="text-right">{payLabel(employee)}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setDetailEmployee(employee)}>
                        Details
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPayEmployee(employee)}>
                        Set pay
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      {detailEmployee ? (
        <Modal open onClose={() => setDetailEmployee(null)} title={detailEmployee.displayName}>
          <dl className="space-y-2 text-sm">
            <Row label="Role" value={detailEmployee.jobTitle ?? '—'} />
            <Row label="Department" value={detailEmployee.department ?? '—'} />
            <Row label="Email" value={detailEmployee.email ?? '—'} />
            <Row label="Hired" value={formatDate(detailEmployee.hiredDate)} />
            <Row label="Status" value={statusLabel[detailEmployee.status]} />
            <Row label="Base pay" value={payLabel(detailEmployee)} />
          </dl>
        </Modal>
      ) : null}

      {payEmployee ? (
        <SetPayModal
          employee={payEmployee}
          onClose={() => setPayEmployee(null)}
          onSaved={() => {
            notify('Base pay updated.');
            refresh();
          }}
        />
      ) : null}

      <AddEmployeeModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          notify('Employee added.');
          refresh();
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function SetPayModal({ employee, onClose, onSaved }: { employee: Employee; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(employee.basePay.amount));
  const [period, setPeriod] = useState(employee.basePay.period);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/payroll/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ basePay: { amount: Number(amount), period } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to update base pay.');
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Set base pay for ${employee.displayName}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="period">Basis</Label>
            <Select id="period" value={period} onChange={(e) => setPeriod(e.target.value as Employee['basePay']['period'])}>
              <option value="hourly">Per hour</option>
              <option value="salary-annual">Per year (salary)</option>
            </Select>
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function AddEmployeeModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [hiredDate, setHiredDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<'hourly' | 'salary-annual'>('hourly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/payroll/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          email: email || undefined,
          jobTitle: jobTitle || undefined,
          department: department || undefined,
          hiredDate,
          basePay: { amount: Number(amount) || 0, period },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to add employee.');
      }
      onSaved();
      onClose();
      setDisplayName('');
      setEmail('');
      setJobTitle('');
      setDepartment('');
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add an employee">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="displayName">Full name</Label>
          <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="jobTitle">Job title</Label>
            <Input id="jobTitle" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="department">Department</Label>
            <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="hiredDate">Hire date</Label>
            <Input id="hiredDate" type="date" value={hiredDate} onChange={(e) => setHiredDate(e.target.value)} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="amount">Base pay</Label>
            <Input id="amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="period">Basis</Label>
            <Select id="period" value={period} onChange={(e) => setPeriod(e.target.value as 'hourly' | 'salary-annual')}>
              <option value="hourly">Per hour</option>
              <option value="salary-annual">Per year (salary)</option>
            </Select>
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Add employee
          </Button>
        </div>
      </form>
    </Modal>
  );
}
