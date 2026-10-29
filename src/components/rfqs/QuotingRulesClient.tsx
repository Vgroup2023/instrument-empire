'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Label, Textarea, FieldGroup } from '@/components/ui/Field';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { loadRulesView } from '@/lib/quoting/service';
import { daysBetween } from '@/lib/quoting/costing';
import { call } from './api';

type Rules = Awaited<ReturnType<typeof loadRulesView>>;
type Tab = 'policy' | 'prices' | 'routing' | 'jobs';

const TABS: { id: Tab; label: string }[] = [
  { id: 'policy', label: 'Pricing policy' },
  { id: 'prices', label: 'Material prices' },
  { id: 'routing', label: 'Routing rules' },
  { id: 'jobs', label: 'Prior jobs' },
];

const PRICE_CSV = 'material,vendor,price,unit,price_date\n6061-T6 Aluminum,Reliable Metals Co.,4.28,LB,2026-10-01';
const JOB_CSV = 'part_number,description,customer,material,operations,qty,labor_hours_per_part,material_cost_per_part,unit_price,completed_on\n1023-001,Flange bracket housing,Acme,6061-T6 Aluminum,"Milling, Drilling",10,0.62,7.40,118.50,2026-03-14';

export function QuotingRulesClient({ initial, today }: { initial: Rules; today: string }) {
  const { notify } = useToast();
  const [rules, setRules] = useState(initial);
  const [tab, setTab] = useState<Tab>('policy');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({
    targetMarginPct: String(initial.settings.targetMarginPct),
    overheadPct: String(initial.settings.overheadPct),
    scrapPct: String(initial.settings.scrapPct),
    priceStaleDays: String(initial.settings.priceStaleDays),
    minLeadDays: String(initial.settings.minLeadDays),
    quoteValidDays: String(initial.settings.quoteValidDays),
    certifications: initial.settings.certifications.join(', '),
  });
  const [price, setPrice] = useState({ material: '', vendor: '', price: '', unit: 'LB', priceDate: today });
  const [rule, setRule] = useState({ operation: '', keywords: '', setupHours: '', runMinutes: '', ratePerHour: '' });
  const [job, setJob] = useState({ partNumber: '', description: '', customerName: '', material: '', operations: '', qty: '1', laborHoursPerPart: '', materialCostPerPart: '', unitPrice: '', completedOn: '' });
  const [csv, setCsv] = useState('');
  const [csvKind, setCsvKind] = useState<'prices' | 'jobs' | null>(null);

  async function reload() {
    setRules(await call<Rules>('GET', '/api/quoting/rules'));
  }

  async function run<T>(fn: () => Promise<T>, success: string) {
    setBusy(true);
    try {
      await fn();
      await reload();
      notify(success);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'That did not save.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

  const savePolicy = () =>
    run(
      () =>
        call('POST', '/api/quoting/rules', {
          kind: 'settings',
          targetMarginPct: num(settings.targetMarginPct),
          overheadPct: num(settings.overheadPct),
          scrapPct: num(settings.scrapPct),
          priceStaleDays: num(settings.priceStaleDays),
          minLeadDays: num(settings.minLeadDays),
          quoteValidDays: num(settings.quoteValidDays),
          certifications: settings.certifications.split(',').map((c) => c.trim()).filter(Boolean),
        }),
      'Pricing policy saved.',
    );

  const remove = (kind: string, id: string) => run(() => call('DELETE', `/api/quoting/rules/${kind}/${id}`), 'Removed.');

  async function importCsv() {
    if (!csvKind) return;
    setBusy(true);
    try {
      const res = await call<{ saved: number; errors: string[] }>('POST', '/api/quoting/import', { kind: csvKind, csv });
      await reload();
      notify(`${res.saved} row${res.saved === 1 ? '' : 's'} imported${res.errors.length ? `; ${res.errors.length} skipped: ${res.errors[0]}` : ''}.`, res.errors.length ? 'error' : 'success');
      if (!res.errors.length) {
        setCsv('');
        setCsvKind(null);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not import.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, extra: { type?: string; hint?: string } = {}) => (
    <FieldGroup>
      <Label>{label}</Label>
      <Input value={value} type={extra.type} inputMode={extra.type === 'date' || extra.type === 'text' ? undefined : 'decimal'} onChange={(e) => set(e.target.value)} />
      {extra.hint ? <p className="text-xs text-slate-500">{extra.hint}</p> : null}
    </FieldGroup>
  );

  const csvPanel = (kind: 'prices' | 'jobs') => (
    <div className="mt-4 border-t border-slate-200 pt-4">
      {csvKind === kind ? (
        <div className="space-y-2">
          <Label>Paste CSV, first row is the header</Label>
          <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={kind === 'prices' ? PRICE_CSV : JOB_CSV} />
          <div className="flex gap-2">
            <Button onClick={importCsv} loading={busy} disabled={!csv.trim()}>
              Import
            </Button>
            <Button variant="secondary" onClick={() => (setCsvKind(null), setCsv(''))}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setCsvKind(kind)}>
          Import {kind === 'prices' ? 'prices' : 'job history'} from CSV
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Quoting rules" description="Your pricing policy, material prices, routing rules and job history. Every quote is built from these, and every number on a quote says which one it used." />

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === t.id ? 'bg-royal-gradient text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'policy' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Pricing policy</CardTitle>
              <CardDescription>Defaults used on every new quote. The estimator can override the margin on a single quote.</CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {field('Target margin %', settings.targetMarginPct, (v) => setSettings({ ...settings, targetMarginPct: v }))}
              {field('Overhead % on direct cost', settings.overheadPct, (v) => setSettings({ ...settings, overheadPct: v }))}
              {field('Scrap allowance % on material', settings.scrapPct, (v) => setSettings({ ...settings, scrapPct: v }))}
              {field('Flag material prices older than (days)', settings.priceStaleDays, (v) => setSettings({ ...settings, priceStaleDays: v }))}
              {field('Minimum lead time (days)', settings.minLeadDays, (v) => setSettings({ ...settings, minLeadDays: v }))}
              {field('Quotes valid for (days)', settings.quoteValidDays, (v) => setSettings({ ...settings, quoteValidDays: v }))}
            </div>
            <FieldGroup>
              <Label>Certifications you hold (comma separated)</Label>
              <Input value={settings.certifications} placeholder="ISO 9001:2015, AS9100D" onChange={(e) => setSettings({ ...settings, certifications: e.target.value })} />
              <p className="text-xs text-slate-500">A request that asks for one you don&apos;t list is flagged as a must-review item.</p>
            </FieldGroup>
            <Button onClick={savePolicy} loading={busy}>
              Save policy
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'prices' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Material prices</CardTitle>
              <CardDescription>The most recent price per vendor. Anything older than {rules.settings.priceStaleDays} days is flagged on the quotes that use it.</CardDescription>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {rules.prices.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No material prices yet" description="Add the prices you pay, or import them from a spreadsheet." />
              </div>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Material</Th>
                    <Th>Vendor</Th>
                    <Th className="text-right">Price</Th>
                    <Th>Price date</Th>
                    <Th>Age</Th>
                    <Th />
                  </Tr>
                </Thead>
                <Tbody>
                  {rules.prices.map((p) => {
                    const age = daysBetween(p.priceDate, today);
                    return (
                      <Tr key={p.id}>
                        <Td className="font-medium text-slate-900">{p.material}</Td>
                        <Td>{p.vendor}</Td>
                        <Td className="text-right">
                          {formatCurrency(p.price)} / {p.unit}
                        </Td>
                        <Td>{formatDate(p.priceDate)}</Td>
                        <Td>{age > rules.settings.priceStaleDays ? <Badge tone="warning">{age} days · outdated</Badge> : <Badge tone="success">{age} days</Badge>}</Td>
                        <Td className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => remove('price', p.id)} disabled={busy}>
                            Remove
                          </Button>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
            <div className="border-t border-slate-200 p-4">
              <p className="mb-3 text-sm font-medium text-slate-900">Add or update a price</p>
              <div className="grid gap-3 sm:grid-cols-5">
                {field('Material', price.material, (v) => setPrice({ ...price, material: v }), { type: 'text' })}
                {field('Vendor', price.vendor, (v) => setPrice({ ...price, vendor: v }), { type: 'text' })}
                {field('Price per unit', price.price, (v) => setPrice({ ...price, price: v }))}
                {field('Unit (LB or KG)', price.unit, (v) => setPrice({ ...price, unit: v }), { type: 'text' })}
                {field('Price date', price.priceDate, (v) => setPrice({ ...price, priceDate: v }), { type: 'date' })}
              </div>
              <div className="mt-3">
                <Button onClick={() => run(() => call('POST', '/api/quoting/rules', { kind: 'price', ...price, price: num(price.price) }).then(() => setPrice({ ...price, material: '', price: '' })), 'Price saved.')} loading={busy} disabled={!price.material || !price.vendor || !price.price}>
                  Save price
                </Button>
              </div>
              {csvPanel('prices')}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'routing' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Routing rules</CardTitle>
              <CardDescription>What each operation costs: setup hours are spread over the quantity, run minutes are per part. Keywords are the words customers use for it.</CardDescription>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {rules.routing.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No routing rules yet" description="Without rules, operations add no labor and are flagged on every quote." />
              </div>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Operation</Th>
                    <Th>Customers call it</Th>
                    <Th className="text-right">Setup h</Th>
                    <Th className="text-right">Run min / part</Th>
                    <Th className="text-right">Rate / h</Th>
                    <Th />
                  </Tr>
                </Thead>
                <Tbody>
                  {rules.routing.map((r) => (
                    <Tr key={r.id}>
                      <Td className="font-medium text-slate-900">{r.operation}</Td>
                      <Td>{r.keywords.join(', ') || '—'}</Td>
                      <Td className="text-right">{r.setupHours}</Td>
                      <Td className="text-right">{r.runMinutes}</Td>
                      <Td className="text-right">{formatCurrency(r.ratePerHour)}</Td>
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => remove('routing', r.id)} disabled={busy}>
                          Remove
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
            <div className="border-t border-slate-200 p-4">
              <p className="mb-3 text-sm font-medium text-slate-900">Add or update an operation</p>
              <div className="grid gap-3 sm:grid-cols-5">
                {field('Operation', rule.operation, (v) => setRule({ ...rule, operation: v }), { type: 'text' })}
                {field('Keywords (comma separated)', rule.keywords, (v) => setRule({ ...rule, keywords: v }), { type: 'text' })}
                {field('Setup hours', rule.setupHours, (v) => setRule({ ...rule, setupHours: v }))}
                {field('Run minutes per part', rule.runMinutes, (v) => setRule({ ...rule, runMinutes: v }))}
                {field('Rate per hour', rule.ratePerHour, (v) => setRule({ ...rule, ratePerHour: v }))}
              </div>
              <div className="mt-3">
                <Button onClick={() => run(() => call('POST', '/api/quoting/rules', { kind: 'routing', operation: rule.operation, keywords: rule.keywords, setupHours: num(rule.setupHours), runMinutes: num(rule.runMinutes), ratePerHour: num(rule.ratePerHour) }).then(() => setRule({ operation: '', keywords: '', setupHours: '', runMinutes: '', ratePerHour: '' })), 'Routing rule saved.')} loading={busy} disabled={!rule.operation}>
                  Save operation
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'jobs' ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Prior jobs</CardTitle>
              <CardDescription>
                {rules.priorJobTotal.toLocaleString()} job{rules.priorJobTotal === 1 ? '' : 's'} on file. New requests are matched to these by part number, or by similar description and material, and a computed price far from history is flagged.
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {rules.priorJobs.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No job history yet" description="Import past jobs from your ERP or spreadsheet so quotes can be checked against what you actually charged." />
              </div>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Part no.</Th>
                    <Th>Description</Th>
                    <Th>Material</Th>
                    <Th className="text-right">Qty</Th>
                    <Th className="text-right">Labor h / part</Th>
                    <Th className="text-right">Unit price</Th>
                    <Th>Completed</Th>
                    <Th />
                  </Tr>
                </Thead>
                <Tbody>
                  {rules.priorJobs.slice(0, 200).map((j) => (
                    <Tr key={j.id}>
                      <Td>{j.partNumber ?? '—'}</Td>
                      <Td className="font-medium text-slate-900">{j.description}</Td>
                      <Td>{j.material ?? '—'}</Td>
                      <Td className="text-right">{j.qty}</Td>
                      <Td className="text-right">{j.laborHoursPerPart ?? '—'}</Td>
                      <Td className="text-right">{j.unitPrice === null ? '—' : formatCurrency(j.unitPrice)}</Td>
                      <Td>{formatDate(j.completedOn)}</Td>
                      <Td className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => remove('job', j.id)} disabled={busy}>
                          Remove
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
            <div className="border-t border-slate-200 p-4">
              <p className="mb-3 text-sm font-medium text-slate-900">Add a job</p>
              <div className="grid gap-3 sm:grid-cols-5">
                {field('Part number', job.partNumber, (v) => setJob({ ...job, partNumber: v }), { type: 'text' })}
                {field('Description', job.description, (v) => setJob({ ...job, description: v }), { type: 'text' })}
                {field('Material', job.material, (v) => setJob({ ...job, material: v }), { type: 'text' })}
                {field('Operations (comma separated)', job.operations, (v) => setJob({ ...job, operations: v }), { type: 'text' })}
                {field('Quantity', job.qty, (v) => setJob({ ...job, qty: v }))}
                {field('Labor hours per part', job.laborHoursPerPart, (v) => setJob({ ...job, laborHoursPerPart: v }))}
                {field('Material cost per part', job.materialCostPerPart, (v) => setJob({ ...job, materialCostPerPart: v }))}
                {field('Unit price charged', job.unitPrice, (v) => setJob({ ...job, unitPrice: v }))}
                {field('Customer', job.customerName, (v) => setJob({ ...job, customerName: v }), { type: 'text' })}
                {field('Completed on', job.completedOn, (v) => setJob({ ...job, completedOn: v }), { type: 'date' })}
              </div>
              <div className="mt-3">
                <Button
                  onClick={() =>
                    run(
                      () =>
                        call('POST', '/api/quoting/rules', { kind: 'job', ...job, qty: num(job.qty), laborHoursPerPart: num(job.laborHoursPerPart), materialCostPerPart: num(job.materialCostPerPart), unitPrice: num(job.unitPrice), completedOn: job.completedOn || undefined }).then(() => setJob({ ...job, partNumber: '', description: '' })),
                      'Job saved.',
                    )
                  }
                  loading={busy}
                  disabled={!job.description}
                >
                  Save job
                </Button>
              </div>
              {csvPanel('jobs')}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
