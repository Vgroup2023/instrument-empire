'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PrintButton } from '@/components/ui/PrintButton';
import { useToast } from '@/components/ui/Toast';
import type { Report } from '@/lib/crm/model';
import { crmCall } from './api';

/** The daily and weekly reports the Reporting agent writes, newest first. */
export function ReportsPanel({ reports, onReport }: { reports: Report[]; onReport: (r: Report) => void }) {
  const { notify } = useToast();
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState<'daily' | 'weekly' | null>(null);
  const sorted = [...reports].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : a.kind < b.kind ? 1 : -1));
  const current = sorted.find((r) => r.id === pick) ?? sorted[0];

  async function write(kind: 'daily' | 'weekly') {
    setBusy(kind);
    try {
      const res = await crmCall<{ report: Report }>('/api/crm/reports', 'POST', { kind });
      onReport(res.report);
      setPick(res.report.id);
      notify(`${kind === 'daily' ? 'Daily' : 'Weekly'} report written.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not write the report.', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="space-y-3 xl:col-span-4 print:hidden">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={busy === 'daily'} onClick={() => write('daily')}>Write today&apos;s report</Button>
          <Button variant="secondary" loading={busy === 'weekly'} onClick={() => write('weekly')}>Write this week&apos;s</Button>
        </div>
        <Card className="px-4 py-2">
          {sorted.length === 0 ? <p className="py-4 text-sm text-slate-500">No reports yet. The Reporting agent writes the daily report each morning and the weekly one on Monday, or write one now.</p> : (
            <ul className="divide-y divide-slate-100">
              {sorted.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setPick(r.id)} className={`flex w-full items-center justify-between gap-2 py-2.5 text-left text-sm ${current?.id === r.id ? 'font-semibold text-brand-700' : 'text-slate-800'}`}>
                    <span>{r.kind === 'daily' ? r.period : `Week of ${r.period}`}</span>
                    <span className="flex items-center gap-1.5"><Badge tone={r.kind === 'weekly' ? 'brand' : 'neutral'}>{r.kind}</Badge>{r.emailedAt ? <Badge tone="success">emailed</Badge> : null}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card className="p-5 xl:col-span-8">
        {current ? (
          <>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 className="text-[15px] font-semibold text-[#0f2059]">{current.title}</h3>
              <PrintButton />
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">{current.body.startsWith(current.title) ? current.body.slice(current.title.length).trim() : current.body}</pre>
          </>
        ) : <p className="text-sm text-slate-500">Pick a report.</p>}
      </Card>
    </div>
  );
}
