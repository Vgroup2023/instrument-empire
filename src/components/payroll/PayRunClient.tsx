'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrintButton } from '@/components/ui/PrintButton';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input, Label } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { ItemView, RunView } from '@/lib/payroll/service';
import { wfCall } from '@/components/workforce/api';

const money = (v: number) => formatCurrency(v);
const FREQ: Record<string, string> = { weekly: 'Weekly', biweekly: 'Every two weeks', semimonthly: 'Twice a month', monthly: 'Monthly' };

export function PayRunClient({ initialRun }: { initialRun: RunView }) {
  const { notify } = useToast();
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [view, setView] = useState<'register' | 'stubs'>('register');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ item: ItemView; regularHours: string; overtimeHours: string; extraPay: string } | null>(null);
  const draft = run.status === 'draft';

  async function reload() {
    const r = await wfCall<{ run: RunView }>(`/api/pay-runs/${run.id}`);
    setRun(r.run);
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

  const t = run.totals;
  return (
    <div>
      <PageHeader
        title={`Pay run · ${formatDate(run.payDate)}`}
        description={`${formatDate(run.periodStart)} to ${formatDate(run.periodEnd)} · ${FREQ[run.frequency] ?? run.frequency}${run.note ? ` · ${run.note}` : ''}`}
        actions={
          <>
            <PrintButton />
            {draft ? (
              <>
                <Button variant="secondary" disabled={busy} onClick={async () => { if (confirm('Delete this draft pay run?') && (await act(() => wfCall(`/api/pay-runs/${run.id}`, 'DELETE'), 'Draft deleted.'))) router.push('/dashboard/pay-runs'); }}>Delete draft</Button>
                <Button loading={busy} disabled={run.items.length === 0} onClick={async () => { if (confirm(`Finish this pay run? It posts ${money(t.gross + t.employerTaxes)} to your books and the figures are locked.`)) { if (await act(() => wfCall(`/api/pay-runs/${run.id}/finalize`, 'POST'), 'Pay run finished and posted to your books.')) await reload(); } }}>Finish and post</Button>
              </>
            ) : run.status === 'final' ? (
              <Button variant="secondary" disabled={busy} onClick={async () => { if (confirm('Void this pay run? A reversing entry is posted and these people can be paid again for the same dates.') && (await act(() => wfCall(`/api/pay-runs/${run.id}/void`, 'POST'), 'Pay run voided.'))) await reload(); }}>Void</Button>
            ) : null}
          </>
        }
      />
      <p className="mb-3 text-sm print:hidden">
        <Link prefetch={false} href="/dashboard/pay-runs" className="text-brand-700 hover:underline">← All pay runs</Link>{' '}
        <Badge tone={draft ? 'warning' : run.status === 'final' ? 'success' : 'neutral'}>{draft ? 'Draft: nothing is posted yet' : run.status === 'final' ? 'Finished and posted' : 'Voided'}</Badge>
      </p>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="People" value={String(t.employees)} />
        <StatCard label="Gross pay" value={money(t.gross)} />
        <StatCard label="Taxes withheld" value={money(t.withheld)} />
        <StatCard label="Net pay" value={money(t.net)} />
        <StatCard label="Cost with employer taxes" value={money(t.cost)} />
      </div>

      <div role="tablist" className="mb-4 flex gap-2 print:hidden">
        {(['register', 'stubs'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${view === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{v === 'register' ? 'Payroll register' : 'Pay stubs'}</button>
        ))}
      </div>

      {view === 'register' ? (
        <Card>
          <CardBody className="overflow-x-auto p-0">
            <Table>
              <Thead>
                <Tr><Th>Employee</Th><Th className="text-right">Hours</Th><Th className="text-right">Gross</Th><Th className="text-right">Deductions</Th><Th className="text-right">Federal tax</Th><Th className="text-right">Soc. Sec. + Medicare</Th><Th className="text-right">State tax</Th><Th className="text-right">Net pay</Th><Th className="text-right">Employer taxes</Th>{draft ? <Th className="print:hidden">&nbsp;</Th> : null}</Tr>
              </Thead>
              <Tbody>
                {run.items.map((i) => (
                  <Tr key={i.id}>
                    <Td className="font-medium">{i.name}{i.note ? <span className="block max-w-xs text-xs font-normal text-amber-700">{i.note}</span> : null}</Td>
                    <Td className="text-right tabular-nums">{i.kind === 'hourly' ? <>{i.regularHours}{i.overtimeHours > 0 ? <span className="text-xs text-slate-500"> + {i.overtimeHours} OT</span> : null}</> : <span className="text-slate-400">salary</span>}</Td>
                    <Td className="text-right tabular-nums">{money(i.gross)}</Td>
                    <Td className="text-right tabular-nums">{money(i.pretaxBenefits + i.pretaxRetirement + i.afterTax)}</Td>
                    <Td className="text-right tabular-nums">{money(i.federal)}</Td>
                    <Td className="text-right tabular-nums">{money(i.socialSecurity + i.medicare + i.additionalMedicare)}</Td>
                    <Td className="text-right tabular-nums">{money(i.state)}</Td>
                    <Td className="text-right font-semibold tabular-nums">{money(i.net)}</Td>
                    <Td className="text-right tabular-nums text-slate-600">{money(i.employerSocialSecurity + i.employerMedicare + i.futa + i.suta)}</Td>
                    {draft ? (
                      <Td className="print:hidden"><div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEdit({ item: i, regularHours: String(i.regularHours), overtimeHours: String(i.overtimeHours), extraPay: String(i.extraPay) })}>Adjust</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (await act(() => wfCall(`/api/pay-runs/${run.id}/items/${i.id}`, 'DELETE'), `${i.name} taken out of this run.`)) await reload(); }}>Remove</Button>
                      </div></Td>
                    ) : null}
                  </Tr>
                ))}
                <Tr>
                  <Td className="font-semibold">Total</Td><Td />
                  <Td className="text-right font-semibold tabular-nums">{money(t.gross)}</Td>
                  <Td colSpan={4} className="text-right text-xs text-slate-500">Taxes withheld {money(t.withheld)} · deductions {money(t.deductions)}</Td>
                  <Td className="text-right font-semibold tabular-nums">{money(t.net)}</Td>
                  <Td className="text-right font-semibold tabular-nums">{money(t.employerTaxes)}</Td>
                  {draft ? <Td className="print:hidden" /> : null}
                </Tr>
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {run.items.map((i) => <Stub key={i.id} run={run} item={i} />)}
        </div>
      )}
      {draft ? <p className="mt-3 text-xs text-slate-500 print:hidden">The figures are worked out again when you finish the run, using what has been paid this year so far, so Social Security and unemployment limits are always right.</p> : null}

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Adjust pay: ${edit?.item.name ?? ''}`} description="Change the hours, or add extra pay such as a bonus. Taxes are worked out again."
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={async () => {
          if (!edit) return;
          const body: Record<string, number> = { extraPay: Number(edit.extraPay || 0) };
          if (edit.item.kind === 'hourly') { body.regularHours = Number(edit.regularHours || 0); body.overtimeHours = Number(edit.overtimeHours || 0); }
          if (await act(() => wfCall(`/api/pay-runs/${run.id}/items/${edit.item.id}`, 'PATCH', body), 'Updated.')) { setEdit(null); await reload(); }
        }}>Save</Button></>}>
        {edit ? (
          <div className="grid grid-cols-2 gap-3">
            {edit.item.kind === 'hourly' ? (<>
              <div><Label htmlFor="ad-r">Regular hours</Label><Input id="ad-r" type="number" min={0} step="0.01" value={edit.regularHours} onChange={(e) => setEdit({ ...edit, regularHours: e.target.value })} /></div>
              <div><Label htmlFor="ad-o">Overtime hours (time and a half)</Label><Input id="ad-o" type="number" min={0} step="0.01" value={edit.overtimeHours} onChange={(e) => setEdit({ ...edit, overtimeHours: e.target.value })} /></div>
            </>) : null}
            <div className="col-span-2"><Label htmlFor="ad-x">Extra pay (bonus)</Label><Input id="ad-x" type="number" min={0} step="0.01" value={edit.extraPay} onChange={(e) => setEdit({ ...edit, extraPay: e.target.value })} /></div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Stub({ run, item: i }: { run: RunView; item: ItemView }) {
  const row = (label: string, now: number, ytd?: number) => (
    <tr className="border-b border-slate-100"><td className="py-1">{label}</td><td className="py-1 text-right tabular-nums">{money(now)}</td><td className="py-1 text-right tabular-nums text-slate-500">{ytd === undefined ? '' : money(ytd)}</td></tr>
  );
  return (
    <section className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-5 print:break-after-page print:rounded-none print:border-0">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
        <div><h2 className="text-lg font-semibold text-slate-900">{i.name}</h2><p className="text-sm text-slate-500">{i.jobTitle ?? ''}</p></div>
        <div className="text-right text-sm text-slate-600"><p>Pay date {formatDate(run.payDate)}</p><p>Period {formatDate(run.periodStart)} to {formatDate(run.periodEnd)}</p></div>
      </header>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500"><th className="py-1">&nbsp;</th><th className="py-1 text-right">This pay</th><th className="py-1 text-right">Year to date</th></tr></thead>
        <tbody>
          {i.kind === 'hourly' ? row(`Regular pay (${i.regularHours} h at ${money(i.rate)})`, i.regularPay) : row('Salary', i.regularPay)}
          {i.overtimeHours > 0 ? row(`Overtime (${i.overtimeHours} h at ${money(i.rate * 1.5)})`, i.overtimePay) : null}
          {i.extraPay > 0 ? row('Extra pay', i.extraPay) : null}
          <tr className="border-b border-slate-300 font-semibold"><td className="py-1">Gross pay</td><td className="py-1 text-right tabular-nums">{money(i.gross)}</td><td className="py-1 text-right tabular-nums">{money(i.ytd.gross)}</td></tr>
          {i.pretaxBenefits > 0 ? row('Pre-tax benefits', -i.pretaxBenefits) : null}
          {i.pretaxRetirement > 0 ? row('401(k) deferral', -i.pretaxRetirement) : null}
          {row('Federal income tax', -i.federal, -i.ytd.federal)}
          {row('Social Security', -i.socialSecurity, -i.ytd.socialSecurity)}
          {row('Medicare', -(i.medicare + i.additionalMedicare), -i.ytd.medicare)}
          {i.state > 0 ? row('State income tax', -i.state, -i.ytd.state) : null}
          {i.afterTax > 0 ? row('Other deductions', -i.afterTax) : null}
          <tr className="font-semibold"><td className="py-2 text-base">Net pay</td><td className="py-2 text-right text-base tabular-nums">{money(i.net)}</td><td className="py-2 text-right tabular-nums">{money(i.ytd.net)}</td></tr>
        </tbody>
      </table>
    </section>
  );
}
