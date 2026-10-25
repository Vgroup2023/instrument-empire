'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrintButton } from '@/components/ui/PrintButton';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Label, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { addDays, weekDays, weekStart } from '@/lib/workforce/time';
import { JOB_TITLE_BY_CODE, JOB_TITLES } from '@/lib/workforce/pbj';
import type { ShiftView, StaffMember } from '@/lib/workforce/service';
import { clockLabel, dayName, shortDate, wfCall } from './api';

const blank = { employeeId: '', shiftDate: '', startTime: '07:00', endTime: '15:30', jobTitleCode: '', location: '', note: '' };
const PRESETS: [string, string, string][] = [['Day', '07:00', '15:30'], ['Evening', '15:00', '23:30'], ['Night', '23:00', '07:30']];

export function ScheduleClient({ initialShifts, staff, today }: { initialShifts: ShiftView[]; staff: StaffMember[]; today: string }) {
  const { notify } = useToast();
  const [start, setStart] = useState(weekStart(today));
  const [shifts, setShifts] = useState(initialShifts);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<(typeof blank & { id?: string }) | null>(null);
  const days = weekDays(start);
  const active = staff.filter((s) => s.status !== 'terminated');

  async function load(weekOf: string) {
    setBusy(true);
    try {
      const r = await wfCall<{ shifts: ShiftView[] }>(`/api/workforce/shifts?from=${weekOf}&to=${addDays(weekOf, 6)}`);
      setShifts(r.shifts);
      setStart(weekOf);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load that week.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      if (done) notify(done);
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!form) return;
    const body = { employeeId: form.employeeId || null, shiftDate: form.shiftDate, startTime: form.startTime, endTime: form.endTime, jobTitleCode: form.jobTitleCode || null, location: form.location, note: form.note };
    if (await act(() => (form.id ? wfCall(`/api/workforce/shifts/${form.id}`, 'PATCH', body) : wfCall('/api/workforce/shifts', 'POST', body)), 'Shift saved.')) {
      setForm(null);
      await load(start);
    }
  }

  const rows: { id: string | null; name: string }[] = [{ id: null, name: 'Open shifts' }, ...active.map((s) => ({ id: s.id, name: s.name }))];
  const hoursFor = (id: string | null) => Math.round(shifts.filter((s) => s.employeeId === id).reduce((a, s) => a + s.hours, 0) * 10) / 10;

  const chip = (s: ShiftView) => (
    <button key={s.id} onClick={() => setForm({ id: s.id, employeeId: s.employeeId ?? '', shiftDate: s.shiftDate, startTime: s.startTime, endTime: s.endTime, jobTitleCode: s.jobTitleCode ? String(s.jobTitleCode) : '', location: s.location ?? '', note: s.note ?? '' })}
      className={`mb-1 block w-full rounded-md border px-2 py-1 text-left text-xs ${s.warnings.length ? 'border-amber-400 bg-amber-50' : 'border-brand-200 bg-brand-50'} hover:shadow-sm`}>
      <span className="font-medium">{clockLabel(s.startTime)}–{clockLabel(s.endTime)}</span>
      {s.jobTitleCode ? <span className="block truncate text-slate-600">{JOB_TITLE_BY_CODE.get(s.jobTitleCode)?.title}</span> : null}
      {s.location ? <span className="block truncate text-slate-500">{s.location}</span> : null}
      {s.warnings.map((w) => <span key={w} className="block text-amber-800">⚠ {w}</span>)}
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Scheduling"
        description="Plan the week: who works which shift. Leave the person empty for an open shift. The schedule is the plan; the hours that count come from Time & attendance."
        actions={<><PrintButton /><Button onClick={() => setForm({ ...blank, shiftDate: days[0] })}>+ Add shift</Button></>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => load(addDays(start, -7))}>← Previous week</Button>
        <span className="px-2 text-sm font-medium text-slate-800">{shortDate(days[0])} to {shortDate(days[6])}</span>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => load(addDays(start, 7))}>Next week →</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => load(weekStart(today))}>This week</Button>
        <Button variant="secondary" size="sm" disabled={busy || shifts.length === 0} onClick={async () => {
          if (await act(async () => {
            const r = await wfCall<{ copied: number; skipped: number }>('/api/workforce/shifts/copy-week', 'POST', { fromWeek: start, toWeek: addDays(start, 7) });
            notify(`Copied ${r.copied} shifts to next week${r.skipped ? `, skipped ${r.skipped} that clash` : ''}.`);
          })) await load(addDays(start, 7));
        }}>Copy this week to next week</Button>
      </div>
      <Card>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <th className="w-40 px-3 py-2">Staff</th>
                {days.map((d, i) => <th key={d} className="px-2 py-2">{dayName(i)} <span className="font-normal text-slate-400">{shortDate(d)}</span></th>)}
                <th className="w-16 px-2 py-2 text-right">Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id ?? 'open'} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium text-slate-900">{r.name}{r.id === null ? <Badge tone="warning" className="ml-1">open</Badge> : null}</td>
                  {days.map((d) => (
                    <td key={d} className="px-2 py-2">
                      {shifts.filter((s) => s.employeeId === r.id && s.shiftDate === d).map(chip)}
                      <button aria-label={`Add shift for ${r.name} on ${d}`} className="text-xs text-slate-400 hover:text-brand-700 print:hidden" onClick={() => setForm({ ...blank, employeeId: r.id ?? '', shiftDate: d })}>+ add</button>
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums">{hoursFor(r.id) || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
      {active.length === 0 ? <p className="mt-3 text-sm text-slate-500">Add employees on the Payroll tab to schedule them.</p> : null}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Edit shift' : 'Add shift'} description="An end time before the start means the shift runs past midnight."
        footer={<>
          {form?.id ? <Button variant="ghost" disabled={busy} onClick={async () => { if (await act(() => wfCall(`/api/workforce/shifts/${form.id}`, 'DELETE'), 'Shift removed.')) { setForm(null); await load(start); } }}>Delete</Button> : null}
          <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
          <Button loading={busy} disabled={!form?.shiftDate} onClick={save}>Save</Button></>}>
        {form ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label htmlFor="sh-emp">Who</Label>
              <Select id="sh-emp" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">Open shift (nobody yet)</option>{active.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select></div>
            <div className="col-span-2 flex flex-wrap gap-2">{PRESETS.map(([n, a, b]) => <Button key={n} size="sm" variant="secondary" onClick={() => setForm({ ...form, startTime: a, endTime: b })}>{n} {clockLabel(a)}–{clockLabel(b)}</Button>)}</div>
            <div><Label htmlFor="sh-date">Date</Label><Input id="sh-date" type="date" value={form.shiftDate} onChange={(e) => setForm({ ...form, shiftDate: e.target.value })} /></div>
            <div />
            <div><Label htmlFor="sh-start">Start</Label><Input id="sh-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /></div>
            <div><Label htmlFor="sh-end">End</Label><Input id="sh-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
            <div className="col-span-2"><Label htmlFor="sh-job">Role</Label>
              <Select id="sh-job" value={form.jobTitleCode} onChange={(e) => setForm({ ...form, jobTitleCode: e.target.value })}>
                <option value="">Their usual job title</option>{JOB_TITLES.map((j) => <option key={j.code} value={j.code}>{j.title}</option>)}
              </Select></div>
            <div><Label htmlFor="sh-loc">Unit or location</Label><Input id="sh-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="East wing" /></div>
            <div><Label htmlFor="sh-note">Note</Label><Input id="sh-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
