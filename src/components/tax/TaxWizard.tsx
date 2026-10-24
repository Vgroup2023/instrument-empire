'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card';
import { FieldGroup, Input, Label, Select } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { computeReturn, type TaxInputs, type TaxResult } from '@/lib/tax';
import { COUNTRY_LABEL, STEPS, type Field } from '@/lib/tax/interview';
import type { TaxReturnRow } from '@/lib/tax/service';
import { printReturn } from './printReturn';
import { SlipUpload } from './SlipUpload';
import { num } from '@/lib/tax';

const money = (n: number, country: 'US' | 'CA') =>
  new Intl.NumberFormat(country === 'CA' ? 'en-CA' : 'en-US', { style: 'currency', currency: country === 'CA' ? 'CAD' : 'USD', maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

type SaveState = 'saved' | 'saving' | 'error';

export function TaxWizard({ initial }: { initial: TaxReturnRow }) {
  const { country } = initial;
  const steps = STEPS[country];
  const reviewIndex = steps.length;
  const [inputs, setInputs] = useState<TaxInputs>(initial.inputs);
  const [step, setStep] = useState(0);
  const [save, setSave] = useState<SaveState>('saved');
  const [status, setStatus] = useState(initial.status);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  const result = useMemo(() => computeReturn(country, inputs), [country, inputs]);

  // Save a moment after the last change, so nothing is lost and nobody has to press Save.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSave('saving');
      try {
        const res = await fetch(`/api/tax/returns/${initial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs }) });
        setSave(res.ok ? 'saved' : 'error');
      } catch {
        setSave('error');
      }
    }, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [inputs, initial.id]);

  function setValue(key: string, value: number | string | boolean | undefined) {
    setSave('saving');
    setInputs((cur) => {
      const next = { ...cur };
      if (value === undefined || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
  }

  /** Amounts read from a slip are added to what is already there, so several jobs add up. */
  function addSlip(values: Record<string, number>) {
    setSave('saving');
    setInputs((cur) => {
      const next = { ...cur };
      for (const [k, v] of Object.entries(values)) next[k] = Math.round((num(cur, k) + v) * 100) / 100;
      return next;
    });
  }

  async function markReady(ready: boolean) {
    const res = await fetch(`/api/tax/returns/${initial.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: ready ? 'ready' : 'draft', inputs }) });
    if (res.ok) setStatus(ready ? 'ready' : 'draft');
  }

  const refund = result.balance < 0;
  const onReview = step >= reviewIndex;
  const current = steps[Math.min(step, steps.length - 1)];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/tax" className="text-sm text-brand-700 hover:underline">
            ← All returns
          </Link>
          <Badge tone={status === 'ready' ? 'success' : 'neutral'}>{status === 'ready' ? 'Ready to file' : 'Draft'}</Badge>
        </div>
        <p className="text-xs text-slate-500" aria-live="polite">
          {save === 'saving' ? 'Saving…' : save === 'error' ? 'Could not save. Check your connection.' : 'All changes saved'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)_18rem]">
        {/* Where you are */}
        <nav aria-label="Interview steps" className="order-2 lg:order-1">
          <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {[...steps.map((s) => s.title), 'Review', 'Your return'].map((title, i) => (
              <li key={title} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setStep(i === steps.length + 1 ? reviewIndex + 1 : i)}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm',
                    i === step ? 'bg-brand-50 font-semibold text-brand-800' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]', i < step ? 'bg-emerald-500 text-white' : 'border border-slate-300')}>{i < step ? '✓' : i + 1}</span>
                  {title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {/* The question page */}
        <div className="order-3 min-w-0 lg:order-2">
          {step < reviewIndex ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{current.title}</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">{current.intro}</p>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                {current.id === 'wages' || current.id === 'employment' ? <SlipUpload country={country} onAdd={addSlip} /> : null}
                {current.fields.filter((f) => !f.when || f.when(inputs)).map((f) => (
                  <FieldInput key={f.key} field={f} value={inputs[f.key]} onChange={(v) => setValue(f.key, v)} />
                ))}
                <div className="flex justify-between pt-2">
                  <Button variant="secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
                    Back
                  </Button>
                  <Button onClick={() => setStep(step + 1)}>{step === reviewIndex - 1 ? 'Review my return' : 'Continue'}</Button>
                </div>
              </CardBody>
            </Card>
          ) : step === reviewIndex ? (
            <ReviewStep result={result} country={country} onBack={() => setStep(reviewIndex - 1)} onNext={() => setStep(reviewIndex + 1)} />
          ) : (
            <ReturnStep
              result={result}
              country={country}
              title={initial.title}
              ready={status === 'ready'}
              onReady={markReady}
              onBack={() => setStep(reviewIndex)}
            />
          )}
        </div>

        {/* The live answer */}
        <aside className="order-1 lg:order-3">
          <Card className="lg:sticky lg:top-0">
            <CardBody>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{refund ? 'Estimated refund' : result.balance > 0 ? 'Estimated amount you owe' : 'Estimated balance'}</p>
              <p className={cn('mt-1 text-3xl font-semibold', refund ? 'text-emerald-700' : result.balance > 0 ? 'text-red-700' : 'text-slate-900')}>{money(Math.abs(result.balance), country)}</p>
              {country === 'CA' ? <p className="mt-1 text-xs text-slate-500">Federal only. Provincial tax is added separately.</p> : null}
              <dl className="mt-4 space-y-1.5 text-sm">
                <Row label="Total income" value={money(result.totalIncome, country)} />
                <Row label="Taxable income" value={money(result.taxableIncome, country)} />
                <Row label="Total tax" value={money(result.totalTax, country)} />
                <Row label="Already paid" value={money(result.totalPayments, country)} />
                <Row label="Average rate" value={pct(result.effectiveRate)} />
                <Row label="Next dollar taxed at" value={pct(result.marginalRate)} />
              </dl>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: number | string | boolean | undefined; onChange: (v: number | string | boolean | undefined) => void }) {
  const id = `tax-${field.key}`;
  if (field.kind === 'bool') {
    return (
      <label className="flex items-start gap-3 text-sm text-slate-800" htmlFor={id}>
        <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
        <span>
          {field.label}
          {field.help ? <span className="mt-0.5 block text-xs text-slate-500">{field.help}</span> : null}
        </span>
      </label>
    );
  }
  return (
    <FieldGroup>
      <Label htmlFor={id}>{field.label}</Label>
      {field.kind === 'select' ? (
        <Select id={id} value={typeof value === 'string' ? value : field.options?.[0]?.value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ) : (
        <div className="relative">
          {field.kind === 'money' ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span> : null}
          <Input
            id={id}
            type="number"
            inputMode={field.kind === 'count' ? 'numeric' : 'decimal'}
            step={field.kind === 'count' ? 1 : 0.01}
            min={field.kind === 'count' ? 0 : undefined}
            className={field.kind === 'money' ? 'pl-7' : undefined}
            value={typeof value === 'number' ? value : ''}
            placeholder={field.kind === 'money' ? '0' : '0'}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </div>
      )}
      {field.help ? <p className="text-xs text-slate-500">{field.help}</p> : null}
    </FieldGroup>
  );
}

const LEVEL: Record<string, { tone: 'warning' | 'brand' | 'neutral'; label: string }> = {
  warn: { tone: 'warning', label: 'Check' },
  tip: { tone: 'brand', label: 'Tip' },
  info: { tone: 'neutral', label: 'Note' },
};

function ReviewStep({ result, country, onBack, onNext }: { result: TaxResult; country: 'US' | 'CA'; onBack: () => void; onNext: () => void }) {
  const order = { warn: 0, tip: 1, info: 2 } as const;
  const findings = [...result.findings].sort((a, b) => order[a.level] - order[b.level]);
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Review</CardTitle>
          <p className="mt-1 text-sm text-slate-500">We checked your answers. Anything marked Check is worth a look before you file.</p>
        </div>
      </CardHeader>
      <CardBody className="space-y-5">
        {findings.length === 0 ? <p className="text-sm text-slate-600">Nothing to flag. Your answers look complete.</p> : null}
        <ul className="space-y-3">
          {findings.map((f) => (
            <li key={f.title} className="flex gap-3 text-sm">
              <Badge tone={LEVEL[f.level].tone}>{LEVEL[f.level].label}</Badge>
              <div>
                <p className="font-medium text-slate-900">{f.title}</p>
                <p className="text-slate-600">{f.detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Not included in this version</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-600">
            {result.notComputed.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">If any of these apply to you, the {country === 'US' ? 'tax' : 'federal tax'} shown is an estimate and a preparer should finish the return.</p>
        </div>
        <div className="flex justify-between">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext}>See my return</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function ReturnStep({ result, country, title, ready, onReady, onBack }: { result: TaxResult; country: 'US' | 'CA'; title: string; ready: boolean; onReady: (ready: boolean) => void; onBack: () => void }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Your {result.taxYear} return</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            {COUNTRY_LABEL[country]}. Each line shows the form it belongs on, so you can copy it to the official form or hand it to a preparer.
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <table className="w-full text-sm">
          <tbody>
            {result.lines.filter((l) => l.heading || l.bold || l.amount !== 0).map((l, i) =>
              l.heading ? (
                <tr key={i}>
                  <th colSpan={3} className="pb-1 pt-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {l.label}
                  </th>
                </tr>
              ) : (
                <tr key={i} className={cn('border-b border-slate-100', l.bold && 'font-semibold text-slate-900')}>
                  <td className="py-1.5 pr-3">
                    {l.label}
                    {l.note ? <span className="block text-xs font-normal text-slate-400">{l.note}</span> : null}
                  </td>
                  <td className="hidden py-1.5 pr-3 text-xs text-slate-400 sm:table-cell">{l.ref}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(l.amount, country)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <p className="rounded-lg bg-gold-50 p-3 text-xs text-gold-800">
          This is a preparation estimate. It does not file anything with the {country === 'US' ? 'IRS' : 'CRA'}: electronic filing needs certified software and your own account. Use these figures on the official forms or give them to a preparer. Keep your slips and receipts for six years.
        </p>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => printReturn(result, title, money)}>
              Print or save as PDF
            </Button>
            <Button onClick={() => onReady(!ready)}>{ready ? 'Back to draft' : 'Mark ready to file'}</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
