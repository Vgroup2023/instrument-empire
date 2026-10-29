'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Label, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import { addDays } from '@/lib/workforce/time';
import { US_STATE_CODES } from '@/lib/workforce/pbj';
import { PERIODS_PER_YEAR, TAX_YEAR, type PayFrequency } from '@/lib/payroll/taxes';
import type { PayProfile, PaySettings, RunListRow, TaxSummary } from '@/lib/payroll/service';
import { wfCall } from '@/components/workforce/api';

type Tab = 'runs' | 'setup' | 'settings' | 'taxes';
interface Acct { id: string; name: string; type: string }

const statusTone = { draft: 'warning', final: 'success', void: 'neutral' } as const;
const FREQ_LABEL: Record<PayFrequency, string> = { weekly: 'Weekly', biweekly: 'Every two weeks', semimonthly: 'Twice a month', monthly: 'Monthly' };
const money = (v: number) => formatCurrency(v);

/** The pay period that ends the day before today's, for a first guess in the new run form. */
function suggestPeriod(today: string, frequency: PayFrequency) {
  const days = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30 }[frequency];
  const end = addDays(today, -1);
  return { periodStart: addDays(end, -(days - 1)), periodEnd: end, payDate: addDays(end, 5) };
}

export function PayRunsClient({ runs: initialRuns, profiles: initialProfiles, settings: initialSettings, accounts, summary: initialSummary, today }: {
  runs: RunListRow[]; profiles: PayProfile[]; settings: PaySettings; accounts: Acct[]; summary: TaxSummary; today: string;
}) {
  const { notify } = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('runs');
  const [runs] = useState(initialRuns);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [settings, setSettings] = useState(initialSettings);
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState(false);
  const [newRun, setNewRun] = useState<{ frequency: PayFrequency; periodStart: string; periodEnd: string; payDate: string; note: string } | null>(null);
  const [edit, setEdit] = useState<PayProfile | null>(null);
  const [sumYear, setSumYear] = useState(initialSummary.year);
  const [sumQuarter, setSumQuarter] = useState(initialSummary.quarter);

  async function act<T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> {
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

  const ready = !!(settings.wagesAccountId && settings.employerTaxAccountId && settings.taxPayableAccountId && settings.deductionsPayableAccountId && settings.payFromAccountId);
  const of = (types: string[]) => accounts.filter((a) => types.includes(a.type));
  const missingW4 = profiles.filter((p) => p.status === 'active' && !p.hasProfile && p.pbjPayTypeCode !== 3).length;

  const tabs: [Tab, string][] = [['runs', 'Pay runs'], ['setup', 'Employee pay setup'], ['settings', 'Settings'], ['taxes', 'Taxes owed']];

  return (
    <div>
      <PageHeader
        title="Pay runs"
        description={`Pay employees from approved time and salaries, with ${TAX_YEAR} US federal income tax, Social Security and Medicare worked out for you. Finishing a run posts one entry to your books.`}
        actions={<Button disabled={!ready} onClick={() => setNewRun({ frequency: settings.frequency, ...suggestPeriod(today, settings.frequency), note: '' })}>+ New pay run</Button>}
      />
      {!ready ? (
        <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Before the first pay run, open <button className="font-semibold underline" onClick={() => setTab('settings')}>Settings</button> and choose the accounts payroll posts to.
        </div>
      ) : null}
      {missingW4 > 0 ? (
        <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {missingW4} {missingW4 === 1 ? 'employee has' : 'employees have'} no W-4 on file and will be withheld as Single with no adjustments. <button className="font-semibold underline" onClick={() => setTab('setup')}>Add W-4 details</button>
        </div>
      ) : null}
      <div role="tablist" className="mb-4 flex flex-wrap gap-2 print:hidden">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${tab === id ? 'border-brand-600 bg-royal-gradient text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>

      {tab === 'runs' ? (
        <Card>
          <CardBody className="p-0">
            {runs.length === 0 ? (
              <div className="p-6"><EmptyState title="No pay runs yet" description="Choose the pay dates, review each person's pay and taxes, then finish the run." /></div>
            ) : (
              <Table>
                <Thead><Tr><Th>Pay date</Th><Th>Period</Th><Th>People</Th><Th className="text-right">Gross</Th><Th className="text-right">Net pay</Th><Th>Status</Th><Th>&nbsp;</Th></Tr></Thead>
                <Tbody>
                  {runs.map((r) => (
                    <Tr key={r.id}>
                      <Td className="font-medium">{formatDate(r.payDate)}</Td>
                      <Td>{formatDate(r.periodStart)} to {formatDate(r.periodEnd)}<span className="block text-xs text-slate-500">{FREQ_LABEL[r.frequency as PayFrequency] ?? r.frequency}</span></Td>
                      <Td>{r.employees}</Td>
                      <Td className="text-right tabular-nums">{money(r.gross)}</Td>
                      <Td className="text-right tabular-nums">{money(r.net)}</Td>
                      <Td><Badge tone={statusTone[r.status as keyof typeof statusTone] ?? 'neutral'}>{r.status === 'final' ? 'Finished' : r.status === 'void' ? 'Voided' : 'Draft'}</Badge></Td>
                      <Td className="text-right"><Link prefetch={false} href={`/dashboard/pay-runs/${r.id}`} className="text-sm font-medium text-brand-700 hover:underline">Open</Link></Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === 'setup' ? (
        <Card>
          <CardBody className="p-0">
            <p className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">Each person&apos;s Form W-4 (2020 or later) and anything else taken from their pay. Contract and agency staff are paid by their agency and are left out of pay runs.</p>
            <Table>
              <Thead><Tr><Th>Employee</Th><Th>Pay</Th><Th>W-4</Th><Th>State</Th><Th>Taken from pay each period</Th><Th>&nbsp;</Th></Tr></Thead>
              <Tbody>
                {profiles.filter((p) => p.status !== 'terminated').map((p) => (
                  <Tr key={p.employeeId}>
                    <Td className="font-medium">{p.name}{p.pbjPayTypeCode === 3 ? <Badge className="ml-1">agency</Badge> : null}</Td>
                    <Td>{p.payKind === 'hourly' ? `${money(p.rate)}/hr` : `${money(p.rate)}/yr`}</Td>
                    <Td>{p.hasProfile ? <>{p.filingStatus === 'married' ? 'Married filing jointly' : p.filingStatus === 'head' ? 'Head of household' : 'Single'}{p.exempt ? ' · exempt' : ''}</> : <Badge tone="warning">not set</Badge>}</Td>
                    <Td>{p.stateCode || '—'}{p.statePercent || p.stateFixed ? ` · ${p.statePercent ? `${p.statePercent}%` : ''}${p.stateFixed ? ` +${money(p.stateFixed)}` : ''}` : ''}</Td>
                    <Td className="text-xs">{[p.pretaxBenefits && `benefits ${money(p.pretaxBenefits)}`, p.pretaxRetirement && `401(k) ${money(p.pretaxRetirement)}`, p.afterTax && `after tax ${money(p.afterTax)}`].filter(Boolean).join(' · ') || '—'}</Td>
                    <Td className="text-right"><Button size="sm" variant="secondary" onClick={() => setEdit(p)}>Edit</Button></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'settings' ? (
        <Card>
          <CardBody className="space-y-4">
            <p className="text-sm text-slate-600">Payroll posts one journal entry for each finished run. <strong>Net pay</strong> comes out of the bank account you choose. Taxes withheld and the employer&apos;s share are held as a liability until you pay them to the IRS and the state.</p>
            <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={busy} onClick={async () => { const r = await act(() => wfCall<{ settings: PaySettings }>('/api/pay-runs/settings/setup-accounts', 'POST'), 'Accounts are ready.'); if (r) { setSettings(r.settings); router.refresh(); } }}>Set up the payroll accounts for me</Button></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Sel label="Wages expense" value={settings.wagesAccountId} list={of(['Expense', 'Other Expense', 'Cost of Goods Sold'])} onChange={(v) => setSettings({ ...settings, wagesAccountId: v })} />
              <Sel label="Employer payroll tax expense" value={settings.employerTaxAccountId} list={of(['Expense', 'Other Expense', 'Cost of Goods Sold'])} onChange={(v) => setSettings({ ...settings, employerTaxAccountId: v })} />
              <Sel label="Payroll taxes payable" value={settings.taxPayableAccountId} list={of(['Other Current Liability', 'Long Term Liability'])} onChange={(v) => setSettings({ ...settings, taxPayableAccountId: v })} />
              <Sel label="Employee deductions payable" value={settings.deductionsPayableAccountId} list={of(['Other Current Liability', 'Long Term Liability'])} onChange={(v) => setSettings({ ...settings, deductionsPayableAccountId: v })} />
              <Sel label="Pay employees from (bank)" value={settings.payFromAccountId} list={of(['Bank'])} onChange={(v) => setSettings({ ...settings, payFromAccountId: v })} />
              <div><Label htmlFor="ps-freq">Usual pay frequency</Label><Select id="ps-freq" value={settings.frequency} onChange={(e) => setSettings({ ...settings, frequency: e.target.value as PayFrequency })}>{(Object.keys(FREQ_LABEL) as PayFrequency[]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]} ({PERIODS_PER_YEAR[f]} a year)</option>)}</Select></div>
              <div><Label htmlFor="ps-suta">State unemployment rate (%)</Label><Input id="ps-suta" type="number" step="0.001" min={0} max={15} value={settings.sutaRate} onChange={(e) => setSettings({ ...settings, sutaRate: Number(e.target.value) })} /></div>
              <div><Label htmlFor="ps-sutab">State unemployment wage base (per employee, per year)</Label><Input id="ps-sutab" type="number" min={0} value={settings.sutaWageBase} onChange={(e) => setSettings({ ...settings, sutaWageBase: Number(e.target.value) })} /></div>
            </div>
            <p className="text-xs text-slate-500">Your state unemployment rate and wage base come from your state notice (they differ by state and by employer). Left at 0, no state unemployment tax is counted.</p>
            <Button loading={busy} onClick={async () => { const r = await act(() => wfCall<{ settings: PaySettings }>('/api/pay-runs/settings', 'PUT', settings), 'Settings saved.'); if (r) setSettings(r.settings); }}>Save settings</Button>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'taxes' ? (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
            <div><Label htmlFor="ts-year">Year</Label><Select id="ts-year" value={sumYear} onChange={(e) => setSumYear(Number(e.target.value))}>{[TAX_YEAR + 1, TAX_YEAR, TAX_YEAR - 1].map((y) => <option key={y} value={y}>{y}</option>)}</Select></div>
            <div><Label htmlFor="ts-q">Quarter</Label><Select id="ts-q" value={sumQuarter} onChange={(e) => setSumQuarter(Number(e.target.value))}><option value={1}>Q1 · Jan to Mar</option><option value={2}>Q2 · Apr to Jun</option><option value={3}>Q3 · Jul to Sep</option><option value={4}>Q4 · Oct to Dec</option></Select></div>
            <Button variant="secondary" loading={busy} onClick={async () => { const r = await act(() => wfCall<{ summary: TaxSummary }>(`/api/pay-runs/tax-summary?year=${sumYear}&quarter=${sumQuarter}`)); if (r) setSummary(r.summary); }}>Show</Button>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Wages paid" value={money(summary.wages)} />
            <StatCard label="Federal income tax withheld" value={money(summary.federalWithheld)} />
            <StatCard label="Social Security + Medicare (both shares)" value={money(summary.socialSecurity + summary.medicare + summary.additionalMedicare)} />
            <StatCard label="Form 941 total (before adjustments)" value={money(summary.form941Total)} />
          </div>
          <Card><CardBody className="p-0">
            <Table>
              <Thead><Tr><Th>Tax</Th><Th className="text-right">Amount</Th><Th>Where it goes</Th></Tr></Thead>
              <Tbody>
                <Tr><Td>Federal income tax withheld</Td><Td className="text-right tabular-nums">{money(summary.federalWithheld)}</Td><Td className="text-xs text-slate-500">Form 941</Td></Tr>
                <Tr><Td>Social Security (employee and employer, 12.4%)</Td><Td className="text-right tabular-nums">{money(summary.socialSecurity)}</Td><Td className="text-xs text-slate-500">Form 941</Td></Tr>
                <Tr><Td>Medicare (employee and employer, 2.9%)</Td><Td className="text-right tabular-nums">{money(summary.medicare)}</Td><Td className="text-xs text-slate-500">Form 941</Td></Tr>
                <Tr><Td>Additional Medicare Tax (employee, 0.9% over $200,000)</Td><Td className="text-right tabular-nums">{money(summary.additionalMedicare)}</Td><Td className="text-xs text-slate-500">Form 941</Td></Tr>
                <Tr><Td>State income tax withheld</Td><Td className="text-right tabular-nums">{money(summary.stateWithheld)}</Td><Td className="text-xs text-slate-500">Your state</Td></Tr>
                <Tr><Td>Federal unemployment (FUTA)</Td><Td className="text-right tabular-nums">{money(summary.futa)}</Td><Td className="text-xs text-slate-500">Form 940, yearly</Td></Tr>
                <Tr><Td>State unemployment</Td><Td className="text-right tabular-nums">{money(summary.suta)}</Td><Td className="text-xs text-slate-500">Your state</Td></Tr>
              </Tbody>
            </Table>
          </CardBody></Card>
          <p className="mt-3 text-xs text-slate-500">From {summary.runs} finished pay {summary.runs === 1 ? 'run' : 'runs'} with a pay date in the quarter. These are the amounts to deposit and report; this app does not file or pay them for you. Check them with your accountant against the IRS deposit schedule.</p>
        </>
      ) : null}

      <Modal open={!!newRun} onClose={() => setNewRun(null)} title="New pay run" description="Hourly pay comes from approved time entries; salaries are a share of the year. Overtime is counted over 40 hours in a Monday to Sunday week."
        footer={<><Button variant="ghost" onClick={() => setNewRun(null)}>Cancel</Button><Button loading={busy} onClick={async () => {
          if (!newRun) return;
          const r = await act(() => wfCall<{ id: string; skipped: string[] }>('/api/pay-runs', 'POST', newRun));
          if (r) { if (r.skipped.length) notify(`Left out: ${r.skipped.join(', ')}`); router.push(`/dashboard/pay-runs/${r.id}`); }
        }}>Create draft</Button></>}>
        {newRun ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label htmlFor="nr-f">How often</Label><Select id="nr-f" value={newRun.frequency} onChange={(e) => { const f = e.target.value as PayFrequency; setNewRun({ ...newRun, frequency: f, ...suggestPeriod(today, f) }); }}>{(Object.keys(FREQ_LABEL) as PayFrequency[]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}</Select></div>
            <div><Label htmlFor="nr-s">Period starts</Label><Input id="nr-s" type="date" value={newRun.periodStart} onChange={(e) => setNewRun({ ...newRun, periodStart: e.target.value })} /></div>
            <div><Label htmlFor="nr-e">Period ends</Label><Input id="nr-e" type="date" value={newRun.periodEnd} onChange={(e) => setNewRun({ ...newRun, periodEnd: e.target.value })} /></div>
            <div><Label htmlFor="nr-p">Pay date</Label><Input id="nr-p" type="date" value={newRun.payDate} onChange={(e) => setNewRun({ ...newRun, payDate: e.target.value })} /></div>
            <div><Label htmlFor="nr-n">Note</Label><Input id="nr-n" value={newRun.note} onChange={(e) => setNewRun({ ...newRun, note: e.target.value })} /></div>
          </div>
        ) : null}
      </Modal>

      <ProfileModal key={edit?.employeeId ?? 'none'} profile={edit} busy={busy} onClose={() => setEdit(null)} onSave={async (body) => {
        if (!edit) return;
        const r = await act(() => wfCall<{ profile: PayProfile }>(`/api/pay-runs/profiles/${edit.employeeId}`, 'PUT', body), 'Saved.');
        if (r) { setProfiles((cur) => cur.map((p) => (p.employeeId === edit.employeeId ? r.profile : p))); setEdit(null); }
      }} />
    </div>
  );
}

function Sel({ label, value, list, onChange }: { label: string; value: string | null; list: Acct[]; onChange: (v: string | null) => void }) {
  return (
    <div><Label>{label}</Label>
      <Select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Not chosen</option>{list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select></div>
  );
}

const NUMERIC_FIELDS = ['credits', 'otherIncome', 'deductions', 'extraWithholding', 'statePercent', 'stateFixed', 'pretaxBenefits', 'pretaxRetirement', 'afterTax'] as const;

function initialForm(profile: PayProfile | null): Record<string, string | boolean> {
  if (!profile) return {};
  return {
    filingStatus: profile.filingStatus, step2Checked: profile.step2Checked, credits: String(profile.credits), otherIncome: String(profile.otherIncome), deductions: String(profile.deductions),
    extraWithholding: String(profile.extraWithholding), exempt: profile.exempt, stateCode: profile.stateCode, statePercent: String(profile.statePercent), stateFixed: String(profile.stateFixed),
    pretaxBenefits: String(profile.pretaxBenefits), pretaxRetirement: String(profile.pretaxRetirement), afterTax: String(profile.afterTax),
  };
}

// Mounted with a key per employee, so the form starts from that person's saved setup each time it opens.
function ProfileModal({ profile, busy, onClose, onSave }: { profile: PayProfile | null; busy: boolean; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState(() => initialForm(profile));
  const body = () => {
    const out: Record<string, unknown> = { ...f };
    for (const k of NUMERIC_FIELDS) out[k] = Number(f[k] || 0);
    return out;
  };
  const set = (k: string, v: string | boolean) => setF((cur) => ({ ...cur, [k]: v }));
  const num = (k: string, label: string, hint?: string) => (
    <div><Label htmlFor={`pf-${k}`}>{label}</Label><Input id={`pf-${k}`} type="number" min={0} step="0.01" value={String(f[k] ?? '')} onChange={(e) => set(k, e.target.value)} />{hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}</div>
  );
  return (
    <Modal open={!!profile} onClose={onClose} title={`Pay setup: ${profile?.name ?? ''}`} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => onSave(body())}>Save</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <p className="col-span-2 text-sm font-semibold text-slate-800">Form W-4 (2020 or later)</p>
        <div><Label htmlFor="pf-fs">Step 1(c): filing status</Label><Select id="pf-fs" value={String(f.filingStatus ?? 'single')} onChange={(e) => set('filingStatus', e.target.value)}><option value="single">Single or married filing separately</option><option value="married">Married filing jointly</option><option value="head">Head of household</option></Select></div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.step2Checked === true} onChange={(e) => set('step2Checked', e.target.checked)} /> Step 2: box checked (two jobs)</label>
        {num('credits', 'Step 3: dependents and credits (a year)')}
        {num('otherIncome', 'Step 4(a): other income (a year)')}
        {num('deductions', 'Step 4(b): extra deductions (a year)')}
        {num('extraWithholding', 'Step 4(c): extra to withhold each pay')}
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.exempt === true} onChange={(e) => set('exempt', e.target.checked)} /> Claims exempt from federal income tax withholding (Social Security and Medicare still apply)</label>
        <p className="col-span-2 mt-1 text-sm font-semibold text-slate-800">State income tax</p>
        <div><Label htmlFor="pf-state">State</Label><Select id="pf-state" value={String(f.stateCode ?? '')} onChange={(e) => set('stateCode', e.target.value)}><option value="">None</option>{US_STATE_CODES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
        <div />
        {num('statePercent', 'Percent of wages to withhold', 'From the state withholding form or table.')}
        {num('stateFixed', 'Or a fixed amount each pay')}
        <p className="col-span-2 mt-1 text-sm font-semibold text-slate-800">Taken from each paycheck</p>
        {num('pretaxBenefits', 'Pre-tax benefits (Section 125)', 'Health premiums and the like: lowers income tax, Social Security and Medicare wages.')}
        {num('pretaxRetirement', '401(k) deferral', 'Traditional: lowers income tax wages only.')}
        {num('afterTax', 'After-tax deductions', 'Garnishments, dues, Roth deferrals.')}
      </div>
    </Modal>
  );
}
