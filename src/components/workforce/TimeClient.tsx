'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrintButton } from '@/components/ui/PrintButton';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Label, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { addDays, weekStart } from '@/lib/workforce/time';
import { JOB_TITLES, PAY_TYPES } from '@/lib/workforce/pbj';
import type { StaffMember, TimeEntryView, TimeOffView, WeekSheet } from '@/lib/workforce/service';
import { clockLabel, dayName, shortDate, wfCall } from './api';

type Tab = 'timesheets' | 'timeoff' | 'staff';

const emptyForm = { employeeId: '', workDate: '', startTime: '07:00', endTime: '15:30', mealMinutes: '30', jobTitleCode: '', note: '' };

export function TimeClient({
  initialSheet,
  initialEntries,
  staff: initialStaff,
  initialTimeOff,
  today,
}: {
  initialSheet: WeekSheet;
  initialEntries: TimeEntryView[];
  staff: StaffMember[];
  initialTimeOff: TimeOffView[];
  today: string;
}) {
  const { notify } = useToast();
  const [tab, setTab] = useState<Tab>('timesheets');
  const [sheet, setSheet] = useState(initialSheet);
  const [entries, setEntries] = useState(initialEntries);
  const [staff, setStaff] = useState(initialStaff);
  const [timeOff, setTimeOff] = useState(initialTimeOff);
  const [busy, setBusy] = useState(false);
  const [openEmployee, setOpenEmployee] = useState<string | null>(null);
  const [form, setForm] = useState<(typeof emptyForm & { id?: string }) | null>(null);
  const [pinFor, setPinFor] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState('');
  const [offForm, setOffForm] = useState({ employeeId: '', startDate: today, endDate: today, kind: 'vacation', note: '' });
  const [offOpen, setOffOpen] = useState(false);

  const activeStaff = staff.filter((s) => s.status !== 'terminated');

  async function loadWeek(date: string) {
    setBusy(true);
    try {
      const start = weekStart(date);
      const [s, e] = await Promise.all([
        wfCall<{ sheet: WeekSheet }>(`/api/workforce/timesheet?date=${date}`),
        wfCall<{ entries: TimeEntryView[] }>(`/api/workforce/entries?from=${start}&to=${addDays(start, 6)}`),
      ]);
      setSheet(s.sheet);
      setEntries(e.entries);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load that week.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function run<T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> {
    setBusy(true);
    try {
      const r = await fn();
      if (done) notify(done);
      return r;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const refreshWeek = () => loadWeek(sheet.weekStart);
  const unapprovedIds = entries.filter((e) => !e.approved && e.endTime).map((e) => e.id);
  const openCount = entries.filter((e) => !e.endTime).length;
  const totalHours = sheet.rows.reduce((a, r) => a + r.total, 0);
  const overtime = sheet.rows.reduce((a, r) => a + r.overtime, 0);

  async function saveEntry() {
    if (!form) return;
    const body = { employeeId: form.employeeId, workDate: form.workDate, startTime: form.startTime, endTime: form.endTime, mealMinutes: Number(form.mealMinutes || 0), jobTitleCode: form.jobTitleCode || null, note: form.note };
    const ok = await run(() => (form.id ? wfCall(`/api/workforce/entries/${form.id}`, 'PATCH', body) : wfCall('/api/workforce/entries', 'POST', body)), form.id ? 'Time entry updated. It needs approving again.' : 'Time entry added.');
    if (ok) {
      setForm(null);
      await refreshWeek();
    }
  }

  async function approve(ids: string[], approved: boolean) {
    const r = await run(() => wfCall<{ changed: number }>('/api/workforce/entries/approve', 'POST', { ids, approved }));
    if (r) {
      notify(approved ? `Approved ${r.changed} ${r.changed === 1 ? 'entry' : 'entries'}.` : 'Approval removed.');
      await refreshWeek();
    }
  }

  async function updateStaff(s: StaffMember, patch: Record<string, unknown>, done?: string) {
    const r = await run(() => wfCall<{ staff: StaffMember }>(`/api/workforce/staff/${s.id}`, 'PATCH', patch), done);
    if (r) setStaff((cur) => cur.map((x) => (x.id === s.id ? r.staff : x)));
    return r;
  }

  async function reloadTimeOff() {
    const r = await run(() => wfCall<{ requests: TimeOffView[] }>(`/api/workforce/time-off?from=${addDays(today, -30)}&to=${addDays(today, 60)}`));
    if (r) setTimeOff(r.requests);
  }

  const tabs: [Tab, string][] = [['timesheets', 'Timesheets'], ['timeoff', 'Time off'], ['staff', 'Staff setup']];

  return (
    <div>
      <PageHeader
        title="Time & attendance"
        description="Hours worked, approved by you. Staff clock in on their own phone at /clock; you can also add or fix any shift here. The Payroll Based Journal report is built from the approved hours."
        actions={
          <>
            <PrintButton />
            <Button onClick={() => setForm({ ...emptyForm, workDate: today })}>+ Add time</Button>
          </>
        }
      />
      <div role="tablist" className="mb-4 flex flex-wrap gap-2 print:hidden">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${tab === id ? 'border-brand-600 bg-royal-gradient text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'timesheets' ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => loadWeek(addDays(sheet.weekStart, -7))}>← Previous week</Button>
            <span className="px-2 text-sm font-medium text-slate-800">{shortDate(sheet.days[0])} to {shortDate(sheet.days[6])}</span>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => loadWeek(addDays(sheet.weekStart, 7))}>Next week →</Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => loadWeek(today)}>This week</Button>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Hours this week" value={totalHours.toFixed(1)} />
            <StatCard label="Overtime (non-exempt)" value={overtime.toFixed(1)} />
            <StatCard label="Waiting for approval" value={String(unapprovedIds.length)} />
            <StatCard label="Still clocked in" value={String(openCount)} />
          </div>
          {unapprovedIds.length > 0 ? (
            <div className="mb-4 print:hidden"><Button loading={busy} onClick={() => approve(unapprovedIds, true)}>Approve all {unapprovedIds.length} finished entries this week</Button></div>
          ) : null}
          <Card>
            <CardBody className="p-0">
              {sheet.rows.length === 0 ? (
                <div className="p-6"><EmptyState title="No time this week" description="Hours appear here when staff clock in or you add time." /></div>
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Employee</Th>
                      {sheet.days.map((d, i) => <Th key={d} className="text-right">{dayName(i)}<span className="block text-[10px] font-normal text-slate-400">{shortDate(d)}</span></Th>)}
                      <Th className="text-right">Total</Th>
                      <Th>Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {sheet.rows.flatMap((r) => {
                      const mine = entries.filter((e) => e.employeeId === r.employeeId);
                      const expanded = openEmployee === r.employeeId;
                      const rowEl = (
                        <Tr key={r.employeeId}>
                          <Td className="font-medium text-slate-900">
                            <button className="text-left hover:underline" onClick={() => setOpenEmployee(expanded ? null : r.employeeId)} aria-expanded={expanded}>{r.name}</button>
                          </Td>
                          {r.days.map((h, i) => <Td key={i} className="text-right tabular-nums">{h ? h.toFixed(2) : <span className="text-slate-300">·</span>}</Td>)}
                          <Td className="text-right font-medium tabular-nums">{r.total.toFixed(2)}{r.overtime > 0 ? <Badge tone="warning" className="ml-1">{r.overtime.toFixed(1)} OT</Badge> : null}</Td>
                          <Td>
                            {r.open > 0 ? <Badge tone="danger">Clocked in</Badge> : r.unapproved > 0 ? <Badge tone="warning">{r.unapproved} to approve</Badge> : <Badge tone="success">Approved</Badge>}
                          </Td>
                        </Tr>
                      );
                      if (!expanded) return [rowEl];
                      return [rowEl, (
                        <Tr key={`${r.employeeId}-detail`}>
                          <Td colSpan={10} className="bg-slate-50">
                            <div className="space-y-1 py-1">
                              {mine.map((e) => (
                                <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                  <span className="w-24 font-medium">{shortDate(e.workDate)}</span>
                                  <span>{clockLabel(e.startTime)} to {e.endTime ? clockLabel(e.endTime) : <Badge tone="danger">still in</Badge>}</span>
                                  <span className="text-slate-500">meal {e.mealMinutes} min</span>
                                  <span className="tabular-nums">{e.paidHours.toFixed(2)} h</span>
                                  {e.source === 'manual' ? <Badge>manual</Badge> : null}
                                  {e.approved ? <Badge tone="success">approved</Badge> : null}
                                  <span className="ml-auto flex gap-1 print:hidden">
                                    {e.endTime && !e.approved ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => approve([e.id], true)}>Approve</Button> : null}
                                    {e.approved ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => approve([e.id], false)}>Unapprove</Button> : null}
                                    <Button size="sm" variant="ghost" onClick={() => setForm({ id: e.id, employeeId: e.employeeId, workDate: e.workDate, startTime: e.startTime, endTime: e.endTime ?? '', mealMinutes: String(e.mealMinutes), jobTitleCode: e.jobTitleCode ? String(e.jobTitleCode) : '', note: e.note ?? '' })}>Edit</Button>
                                    <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (confirm('Delete this time entry?')) { await run(() => wfCall(`/api/workforce/entries/${e.id}`, 'DELETE'), 'Deleted.'); await refreshWeek(); } }}>Delete</Button>
                                  </span>
                                </div>
                              ))}
                            </div>
                          </Td>
                        </Tr>
                      )];
                    })}
                  </Tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      ) : null}

      {tab === 'timeoff' ? (
        <>
          <div className="mb-4 print:hidden"><Button onClick={() => { setOffForm({ employeeId: '', startDate: today, endDate: today, kind: 'vacation', note: '' }); setOffOpen(true); }}>+ Time off request</Button></div>
          <Card>
            <CardBody className="p-0">
              {timeOff.length === 0 ? (
                <div className="p-6"><EmptyState title="No time off requests" description="Add a request for vacation, sick days or personal days. Approved time off shows on the schedule." /></div>
              ) : (
                <Table>
                  <Thead><Tr><Th>Employee</Th><Th>Dates</Th><Th>Type</Th><Th>Status</Th><Th className="text-right">Actions</Th></Tr></Thead>
                  <Tbody>
                    {timeOff.map((t) => (
                      <Tr key={t.id}>
                        <Td className="font-medium">{t.employeeName}</Td>
                        <Td>{shortDate(t.startDate)}{t.endDate !== t.startDate ? ` to ${shortDate(t.endDate)}` : ''}</Td>
                        <Td className="capitalize">{t.kind}{t.note ? <span className="block text-xs text-slate-500">{t.note}</span> : null}</Td>
                        <Td><Badge tone={t.status === 'approved' ? 'success' : t.status === 'denied' ? 'danger' : 'warning'}>{t.status}</Badge></Td>
                        <Td className="text-right">
                          <div className="flex justify-end gap-1">
                            {t.status !== 'approved' ? <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { await run(() => wfCall(`/api/workforce/time-off/${t.id}`, 'PATCH', { status: 'approved' })); await reloadTimeOff(); }}>Approve</Button> : null}
                            {t.status !== 'denied' ? <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { await run(() => wfCall(`/api/workforce/time-off/${t.id}`, 'PATCH', { status: 'denied' })); await reloadTimeOff(); }}>Deny</Button> : null}
                            <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { await run(() => wfCall(`/api/workforce/time-off/${t.id}`, 'DELETE')); await reloadTimeOff(); }}>Delete</Button>
                          </div>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      ) : null}

      {tab === 'staff' ? (
        <Card>
          <CardBody className="p-0">
            <p className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
              Each person needs a staff ID (made for you when you first save), a PIN for the phone clock, and the job title and pay type CMS uses in the Payroll Based Journal report. The staff ID is not a Social Security number and must never be one.
            </p>
            {staff.length === 0 ? (
              <div className="p-6"><EmptyState title="No employees yet" description="Add employees on the Payroll tab first." /></div>
            ) : (
              <Table>
                <Thead><Tr><Th>Employee</Th><Th>Staff ID</Th><Th>CMS job title</Th><Th>Pay type</Th><Th>Last day</Th><Th>Clock PIN</Th></Tr></Thead>
                <Tbody>
                  {staff.map((s) => (
                    <Tr key={s.id}>
                      <Td className="font-medium">{s.name}{s.status === 'terminated' ? <Badge tone="danger" className="ml-1">left</Badge> : null}<span className="block text-xs font-normal text-slate-500">{s.jobTitle ?? ''}</span></Td>
                      <Td className="font-mono text-xs">{s.staffCode ?? <span className="text-slate-400">made on first save</span>}</Td>
                      <Td>
                        <Select aria-label={`CMS job title for ${s.name}`} value={s.pbjJobTitleCode ?? ''} onChange={(e) => updateStaff(s, { pbjJobTitleCode: e.target.value || null })}>
                          <option value="">Not set</option>
                          {JOB_TITLES.map((j) => <option key={j.code} value={j.code}>{j.code} · {j.title}{j.optional ? ' (optional)' : ''}</option>)}
                        </Select>
                      </Td>
                      <Td>
                        <Select aria-label={`Pay type for ${s.name}`} value={s.pbjPayTypeCode ?? ''} onChange={(e) => updateStaff(s, { pbjPayTypeCode: e.target.value || null })}>
                          <option value="">Not set</option>
                          {PAY_TYPES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                        </Select>
                      </Td>
                      <Td><Input type="date" aria-label={`Last day for ${s.name}`} defaultValue={s.terminationDate ?? ''} onBlur={(e) => { if ((e.target.value || null) !== s.terminationDate) updateStaff(s, { terminationDate: e.target.value || null }, 'Last day saved.'); }} /></Td>
                      <Td><Button size="sm" variant="secondary" onClick={() => { setPin(''); setPinFor(s); }}>{s.hasPin ? 'Reset PIN' : 'Set PIN'}</Button></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit time entry' : 'Add time'} description="Times are as the clock shows at the facility. An end time before the start means the shift runs past midnight."
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button loading={busy} disabled={!form?.employeeId || !form?.workDate || !form?.startTime} onClick={saveEntry}>Save</Button></>}>
        {form ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label htmlFor="te-emp">Employee</Label>
              <Select id="te-emp" value={form.employeeId} disabled={!!form.id} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">Choose…</option>{activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select></div>
            <div><Label htmlFor="te-date">Date</Label><Input id="te-date" type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} /></div>
            <div><Label htmlFor="te-meal">Meal break (minutes)</Label><Input id="te-meal" type="number" min={0} max={240} value={form.mealMinutes} onChange={(e) => setForm({ ...form, mealMinutes: e.target.value })} /></div>
            <div><Label htmlFor="te-start">Start</Label><Input id="te-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
            <div><Label htmlFor="te-end">End (leave empty if still working)</Label><Input id="te-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
            <div className="col-span-2"><Label htmlFor="te-job">Job worked, if not their usual one</Label>
              <Select id="te-job" value={form.jobTitleCode} onChange={(e) => setForm({ ...form, jobTitleCode: e.target.value })}>
                <option value="">Their usual job title</option>{JOB_TITLES.map((j) => <option key={j.code} value={j.code}>{j.code} · {j.title}</option>)}
              </Select></div>
            <div className="col-span-2"><Label htmlFor="te-note">Note</Label><Input id="te-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Forgot to clock out" /></div>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!pinFor} onClose={() => setPinFor(null)} title={`Clock PIN for ${pinFor?.name ?? ''}`} description="4 to 8 digits. Tell it to the person only. Five wrong tries lock the clock for that person for 15 minutes; setting a new PIN unlocks it."
        footer={<><Button variant="ghost" onClick={() => setPinFor(null)}>Cancel</Button><Button loading={busy} disabled={!/^\d{4,8}$/.test(pin)} onClick={async () => { if (pinFor && (await updateStaff(pinFor, { pin }, 'PIN saved.'))) setPinFor(null); }}>Save PIN</Button></>}>
        <Label htmlFor="pin">New PIN</Label>
        <Input id="pin" inputMode="numeric" autoComplete="off" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        {pinFor && !pinFor.staffCode ? <p className="mt-2 text-xs text-slate-500">Saving the PIN also makes the staff ID.</p> : null}
      </Modal>

      <Modal open={offOpen} onClose={() => setOffOpen(false)} title="Time off request"
        footer={<><Button variant="ghost" onClick={() => setOffOpen(false)}>Cancel</Button><Button loading={busy} disabled={!offForm.employeeId} onClick={async () => { if (await run(() => wfCall('/api/workforce/time-off', 'POST', offForm), 'Request added.')) { setOffOpen(false); await reloadTimeOff(); } }}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label htmlFor="to-emp">Employee</Label>
            <Select id="to-emp" value={offForm.employeeId} onChange={(e) => setOffForm({ ...offForm, employeeId: e.target.value })}><option value="">Choose…</option>{activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
          <div><Label htmlFor="to-start">First day</Label><Input id="to-start" type="date" value={offForm.startDate} onChange={(e) => setOffForm({ ...offForm, startDate: e.target.value, endDate: e.target.value > offForm.endDate ? e.target.value : offForm.endDate })} /></div>
          <div><Label htmlFor="to-end">Last day</Label><Input id="to-end" type="date" value={offForm.endDate} min={offForm.startDate} onChange={(e) => setOffForm({ ...offForm, endDate: e.target.value })} /></div>
          <div><Label htmlFor="to-kind">Type</Label><Select id="to-kind" value={offForm.kind} onChange={(e) => setOffForm({ ...offForm, kind: e.target.value })}><option value="vacation">Vacation</option><option value="sick">Sick</option><option value="personal">Personal</option><option value="other">Other</option></Select></div>
          <div><Label htmlFor="to-note">Note</Label><Input id="to-note" value={offForm.note} onChange={(e) => setOffForm({ ...offForm, note: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}
