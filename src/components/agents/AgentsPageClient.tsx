'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Label, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { AGENTS, DEPARTMENTS, type AgentId, type Department } from '@/lib/agents/types';

interface FindingRow {
  id: string;
  agent: string;
  severity: string;
  title: string;
  detail: string;
  department: string;
  action: Record<string, string> | null;
  createdAt: string;
}

const SEVERITY_TONE = { critical: 'danger', high: 'warning', medium: 'brand', low: 'neutral' } as const;
const STALE_HOURS = 26;

function ago(iso: string | null, nowIso: string): string {
  if (!iso) return 'never run';
  const mins = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export function AgentsPageClient({
  overview,
  findings,
  restricted,
  generatedAt,
  initialDepartment,
}: {
  overview: { lastRun: Record<string, string | null>; openCount: Record<string, number> };
  findings: FindingRow[];
  restricted: { id: string; name: string; listName: string }[];
  /** Server render time, so freshness doesn't depend on the client clock during render. */
  generatedAt: string;
  initialDepartment: Department | 'all';
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<AgentId | 'all'>('all');
  const [names, setNames] = useState('');
  const [dept, setDept] = useState<Department | 'all'>(initialDepartment);

  async function call(url: string, init: RequestInit, ok: string) {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify(data.error ?? 'Something went wrong.', 'error');
      return false;
    }
    notify(ok);
    router.refresh();
    return true;
  }

  async function runNow() {
    setRunning(true);
    await call('/api/agents/run', { method: 'POST' }, 'Agents finished their run.');
    setRunning(false);
  }

  const shown = findings.filter((f) => (filter === 'all' || f.agent === filter) && (dept === 'all' || f.department === dept));

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI agents"
        description="Six agents check your shipments and accounts every day and queue what needs a person."
        actions={
          <Button onClick={runNow} loading={running}>
            Run all now
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((a) => {
          const last = overview.lastRun[a.id] ?? null;
          const fresh = last !== null && new Date(generatedAt).getTime() - new Date(last).getTime() < STALE_HOURS * 3_600_000;
          const open = overview.openCount[a.id] ?? 0;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setFilter(filter === a.id ? 'all' : a.id)}
              className={`rounded-xl2 border bg-surface p-4 text-left shadow-card transition hover:border-brand-400 ${filter === a.id ? 'border-brand-500' : 'border-slate-200'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{a.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`h-2.5 w-2.5 animate-pulse rounded-full ${fresh ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  {fresh ? 'Online' : 'Stale'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{a.summary}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Last run {ago(last, generatedAt)}</span>
                <Badge tone={open ? 'warning' : 'success'}>{open} open</Badge>
              </div>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{filter === 'all' ? 'Open findings' : `Open findings: ${AGENTS.find((a) => a.id === filter)?.name}`}</CardTitle>
            <CardDescription>Most urgent first. Resolve what you&apos;ve handled, dismiss what doesn&apos;t apply.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
            {([{ id: 'all', name: 'All departments' }, ...DEPARTMENTS] as { id: Department | 'all'; name: string }[]).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDept(d.id)}
                className={`rounded-full px-3 py-1 text-xs ${dept === d.id ? 'bg-brand-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-50'}`}
              >
                {d.name}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <EmptyState title="Nothing needs attention" description="Add shipments, then run the agents to see findings here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {shown.map((f) => (
                <li key={f.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={SEVERITY_TONE[f.severity as keyof typeof SEVERITY_TONE] ?? 'neutral'}>{f.severity}</Badge>
                      <span className="text-xs text-slate-500">
                        {AGENTS.find((a) => a.id === f.agent)?.name} · {DEPARTMENTS.find((d) => d.id === f.department)?.name}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">{f.title}</p>
                    <p className="text-xs text-slate-500">{f.detail}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {f.action?.type === 'link' ? (
                      <Link href={f.action.href} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        Open
                      </Link>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={() => call('/api/agents/findings', { method: 'PATCH', body: JSON.stringify({ ids: [f.id], status: 'resolved' }) }, 'Marked resolved.')}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => call('/api/agents/findings', { method: 'PATCH', body: JSON.stringify({ ids: [f.id], status: 'dismissed' }) }, 'Dismissed.')}>
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Restricted-party list</CardTitle>
            <CardDescription>
              Export Shield screens every shipper and consignee against these names. Paste entries from the official Consolidated Screening List; matching is approximate.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div>
            <Label htmlFor="rp-names">Add names, one per line</Label>
            <Textarea id="rp-names" rows={3} value={names} onChange={(e) => setNames(e.target.value)} />
          </div>
          <Button
            size="sm"
            disabled={!names.trim()}
            onClick={async () => {
              if (await call('/api/restricted-parties', { method: 'POST', body: JSON.stringify({ names }) }, 'Names added.')) setNames('');
            }}
          >
            Add to list
          </Button>
          {restricted.length ? (
            <ul className="flex flex-wrap gap-2 pt-2">
              {restricted.map((r) => (
                <li key={r.id} className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-xs text-slate-700">
                  {r.name}
                  <button
                    type="button"
                    aria-label={`Remove ${r.name}`}
                    className="rounded-full px-1.5 text-slate-500 hover:bg-slate-200"
                    onClick={() => call(`/api/restricted-parties?id=${r.id}`, { method: 'DELETE' }, 'Removed.')}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">No names yet. Export Shield still checks embargoed destinations and EEI timing.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
