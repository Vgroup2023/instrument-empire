'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FieldGroup, Input, Label } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { computeReturn, type Country } from '@/lib/tax';
import { COUNTRY_LABEL } from '@/lib/tax/interview';
import type { TaxReturnRow } from '@/lib/tax/service';

const money = (n: number, country: Country) =>
  new Intl.NumberFormat(country === 'CA' ? 'en-CA' : 'en-US', { style: 'currency', currency: country === 'CA' ? 'CAD' : 'USD', maximumFractionDigits: 0 }).format(n);

export function TaxReturnsClient({ initial, years }: { initial: TaxReturnRow[]; years: number[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<Country>('US');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch('/api/tax/returns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country, title, taxYear: years[0] }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start the return.');
      router.push(`/dashboard/tax/${data.taxReturn.id}`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not start the return.', 'error');
      setBusy(false);
    }
  }

  async function remove(row: TaxReturnRow) {
    if (!window.confirm(`Delete the ${row.taxYear} return for ${row.title}? This cannot be undone.`)) return;
    const res = await fetch(`/api/tax/returns/${row.id}`, { method: 'DELETE' });
    if (res.ok) setRows((r) => r.filter((x) => x.id !== row.id));
    else notify('Could not delete that return.', 'error');
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Prepare a {years[0]} income tax return</h2>
            <p className="mt-1 text-sm text-slate-600">
              Answer plain questions about your year, watch your refund or balance update as you go, and get a line-by-line return to file or hand to a preparer. Personal and small-business income, United States and Canada. We never ask for a Social Security or Social Insurance number.
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>Start a return</Button>
        </CardBody>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="No returns yet" description="Start a return to see how it works. Your answers save as you go." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => {
            const res = computeReturn(r.country, r.inputs);
            const refund = res.balance < 0;
            return (
              <li key={r.id}>
                <Card>
                  <CardBody className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{r.title}</p>
                        <p className="text-xs text-slate-500">
                          {r.taxYear} · {COUNTRY_LABEL[r.country]}
                        </p>
                      </div>
                      <Badge tone={r.status === 'ready' ? 'success' : 'neutral'}>{r.status === 'ready' ? 'Ready' : 'Draft'}</Badge>
                    </div>
                    <p className="text-sm text-slate-600">
                      {refund ? 'Estimated refund' : res.balance > 0 ? 'Estimated amount owing' : 'Estimated balance'}
                      <span className={`ml-2 text-lg font-semibold ${refund ? 'text-emerald-700' : res.balance > 0 ? 'text-red-700' : 'text-slate-900'}`}>{money(Math.abs(res.balance), r.country)}</span>
                    </p>
                    <div className="flex items-center justify-between">
                      <Link href={`/dashboard/tax/${r.id}`} className="inline-flex items-center rounded-lg bg-royal-gradient px-3.5 py-2 text-sm font-medium text-white hover:brightness-110">
                        Open
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                        Delete
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Start a return"
        description="Pick the country you are filing in. You can start more than one, for example a personal return and a partner's."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy} disabled={!title.trim()}>
              Start
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-slate-700">Where are you filing?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['US', 'CA'] as const).map((c) => (
                <label key={c} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${country === c ? 'border-brand-500 bg-brand-50 font-medium' : 'border-slate-300'}`}>
                  <input type="radio" name="taxCountry" checked={country === c} onChange={() => setCountry(c)} />
                  {COUNTRY_LABEL[c]}
                </label>
              ))}
            </div>
          </fieldset>
          <FieldGroup>
            <Label htmlFor="taxTitle">Whose return is this?</Label>
            <Input id="taxTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name, e.g. Jane Doe" maxLength={120} />
          </FieldGroup>
        </div>
      </Modal>
    </div>
  );
}
