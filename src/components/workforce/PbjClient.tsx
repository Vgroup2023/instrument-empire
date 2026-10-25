'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrintButton } from '@/components/ui/PrintButton';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Input, Label, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { daysBetween } from '@/lib/workforce/time';
import { US_STATE_CODES } from '@/lib/workforce/pbj';
import type { PbjPreview, WorkforceSettings } from '@/lib/workforce/service';
import { shortDate, wfCall } from './api';

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'America/Puerto_Rico'];

export function PbjClient({ settings: initialSettings, initialPreview, today }: { settings: WorkforceSettings; initialPreview: PbjPreview; today: string }) {
  const { notify } = useToast();
  const [settings, setSettings] = useState(initialSettings);
  const [preview, setPreview] = useState(initialPreview);
  const [quarter, setQuarter] = useState(initialPreview.quarter);
  const [busy, setBusy] = useState(false);
  const [processType, setProcessType] = useState<'replace' | 'merge'>('replace');
  const thisFy = Number(today.slice(0, 4)) + 1;

  async function load(q: { fiscalYear: number; quarter: number }) {
    setBusy(true);
    try {
      const r = await wfCall<{ preview: PbjPreview }>(`/api/workforce/pbj?fy=${q.fiscalYear}&q=${q.quarter}`);
      setPreview(r.preview);
      setQuarter(r.preview.quarter);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load that quarter.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    try {
      const r = await wfCall<{ settings: WorkforceSettings }>('/api/workforce/settings', 'PUT', settings);
      setSettings(r.settings);
      notify('Settings saved.');
      await load(quarter);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.', 'error');
      setBusy(false);
    }
  }

  const file = (force: boolean) => `/api/workforce/pbj/file?fy=${quarter.fiscalYear}&q=${quarter.quarter}&processType=${processType}${force ? '&force=1' : ''}`;
  const daysLeft = daysBetween(today, preview.deadline);
  const errors = preview.issues.filter((i) => i.level === 'error');

  return (
    <div>
      <PageHeader
        title="Payroll Based Journal"
        description="The staffing report US nursing homes send to CMS every quarter: each person's paid hours by day, job title and pay type. Built from approved time entries, in CMS file version 4.10.0."
        actions={<PrintButton />}
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="pbj-fy">Federal fiscal year</Label>
            <Select id="pbj-fy" value={quarter.fiscalYear} onChange={(e) => load({ fiscalYear: Number(e.target.value), quarter: quarter.quarter })}>
              {[thisFy + 1, thisFy, thisFy - 1, thisFy - 2, thisFy - 3].map((y) => <option key={y} value={y}>FY {y}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="pbj-q">Quarter</Label>
            <Select id="pbj-q" value={quarter.quarter} onChange={(e) => load({ fiscalYear: quarter.fiscalYear, quarter: Number(e.target.value) })}>
              <option value={1}>Q1 · Oct to Dec</option><option value={2}>Q2 · Jan to Mar</option><option value={3}>Q3 · Apr to Jun</option><option value={4}>Q4 · Jul to Sep</option>
            </Select>
          </div>
          <p className="text-sm text-slate-600">{shortDate(preview.start)} to {shortDate(preview.end)}. CMS must receive it by <strong>{shortDate(preview.deadline)}</strong> ({daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days ago`}). After that CMS accepts nothing.</p>
        </CardBody>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Approved hours" value={preview.totalHours.toLocaleString('en-US', { maximumFractionDigits: 1 })} />
        <StatCard label="Staff reported" value={String(preview.staffCount)} />
        <StatCard label="Ready for CMS" value={preview.ready ? 'Yes' : 'Not yet'} />
      </div>

      <Card className="mb-4">
        <CardHeader><div><CardTitle>{preview.ready ? 'Ready to send' : `${errors.length} ${errors.length === 1 ? 'thing needs' : 'things need'} fixing first`}</CardTitle>
          <CardDescription>{preview.ready ? 'Download the file, then upload it to CMS (iQIES, Staffing Data Submission).' : 'The file is only offered when nothing is missing, so a half-finished quarter is not sent by mistake.'}</CardDescription></div></CardHeader>
        <CardBody className="space-y-3">
          {preview.issues.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {preview.issues.map((i, n) => (
                <li key={n} className="flex gap-2"><Badge tone={i.level === 'error' ? 'danger' : 'warning'}>{i.level === 'error' ? 'Fix' : 'Note'}</Badge><span>{i.message}</span></li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-end gap-3 print:hidden">
            <div>
              <Label htmlFor="pbj-pt">When CMS receives it</Label>
              <Select id="pbj-pt" value={processType} onChange={(e) => setProcessType(e.target.value as 'replace' | 'merge')}>
                <option value="replace">Replace everything already sent for this quarter</option>
                <option value="merge">Add to or update what was already sent</option>
              </Select>
            </div>
            {preview.ready ? (
              <a href={file(false)} className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Download PBJ file (XML)</a>
            ) : (
              <span className="text-sm text-slate-500">Download unlocks when the list above is clear.</span>
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader><div><CardTitle>Hours by job title</CardTitle><CardDescription>What the file will report for this quarter.</CardDescription></div></CardHeader>
        <CardBody className="p-0">
          {preview.byJobTitle.length === 0 ? <p className="p-4 text-sm text-slate-500">No approved hours in this quarter yet.</p> : (
            <Table>
              <Thead><Tr><Th>Code</Th><Th>Job title</Th><Th>Category</Th><Th className="text-right">Hours</Th></Tr></Thead>
              <Tbody>{preview.byJobTitle.map((j) => <Tr key={j.code}><Td>{j.code}</Td><Td>{j.title}</Td><Td>{j.category}</Td><Td className="text-right tabular-nums">{j.hours.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Td></Tr>)}</Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card className="print:hidden">
        <CardHeader><div><CardTitle>Facility and rules</CardTitle><CardDescription>Used to build the file and to count hours the way CMS does.</CardDescription></div></CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><Label htmlFor="st-ccn">CMS certification number (CCN)</Label><Input id="st-ccn" maxLength={16} value={settings.facilityId} onChange={(e) => setSettings({ ...settings, facilityId: e.target.value })} placeholder="e.g. 345678" /></div>
          <div><Label htmlFor="st-state">State</Label>
            <Select id="st-state" value={settings.stateCode} onChange={(e) => setSettings({ ...settings, stateCode: e.target.value })}><option value="">Choose…</option>{US_STATE_CODES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
          <div><Label htmlFor="st-tz">Facility time zone</Label>
            <Select id="st-tz" value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}>{[...new Set([settings.timezone, ...ZONES])].map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}</Select></div>
          <div><Label htmlFor="st-meal">Meal minutes always taken off a shift</Label><Input id="st-meal" type="number" min={0} max={120} value={settings.mealDeductMinutes} onChange={(e) => setSettings({ ...settings, mealDeductMinutes: Number(e.target.value) })} /></div>
          <div><Label htmlFor="st-thr">…for shifts at least this many hours long</Label><Input id="st-thr" type="number" min={0} max={24} step={0.5} value={settings.mealThresholdHours} onChange={(e) => setSettings({ ...settings, mealThresholdHours: Number(e.target.value) })} /></div>
          <div className="flex items-end"><Button loading={busy} onClick={saveSettings}>Save</Button></div>
          <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">CMS counts mealtimes as non-work whether or not they are paid: it expects at least 30 minutes off every full shift, and the real break if it was longer. Shifts that cross midnight are split between the two days. Confirm the short-shift setting with your compliance advisor.</p>
        </CardBody>
      </Card>
    </div>
  );
}
