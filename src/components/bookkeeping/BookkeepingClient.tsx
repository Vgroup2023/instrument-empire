'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Input, Label, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { GlAccount } from '@/lib/accounting/chartOfAccounts';
import type { BankTxn, BookkeepingRule, Overview } from '@/lib/bookkeeping/service';
import type { ExpenseAccountOption } from '@/lib/bookkeeping/categorize';

interface Payload {
  overview: Overview;
  rules: BookkeepingRule[];
  options: ExpenseAccountOption[];
}

const SOURCE: Record<string, string> = { rule: 'Your rule', history: 'Past approvals', ai: 'Claude' };

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}

export function BookkeepingClient({ accounts }: { accounts: GlAccount[] }) {
  const { notify } = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.Id ?? '');
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [makeRule, setMakeRule] = useState<Record<string, boolean>>({});
  const [rulePattern, setRulePattern] = useState('');
  const [ruleAccount, setRuleAccount] = useState('');
  const [ruleAuto, setRuleAuto] = useState(false);

  const [tick, setTick] = useState(0);
  const load = useCallback(async () => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    call('/api/bookkeeping', 'GET')
      .then((d) => {
        if (!live) return;
        setData(d);
        setLoadError(null);
      })
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : 'Failed to load.'));
    return () => {
      live = false;
    };
  }, [tick]);

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    try {
      const msg = await fn();
      if (msg) notify(msg, 'success');
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
    } finally {
      setBusy(null);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.onerror = () => notify("Couldn't read that file.", 'error');
    reader.readAsText(file);
  }

  if (accounts.length === 0) {
    return <EmptyState title="No bank or credit card accounts yet" description="Add one in your Chart of Accounts first." />;
  }
  if (loadError) return <EmptyState title="Couldn't load bookkeeping" description={loadError} />;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const { overview: o, rules, options } = data;
  const optionId = (t: BankTxn) => choice[t.id] ?? t.suggestedAccountId ?? '';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Waiting for you" value={String(o.counts.review)} hint={o.confidentWaiting > 0 ? `${o.confidentWaiting} ready to approve` : 'Nothing ready to approve in one click'} />
        <StatCard label="Booked" value={String(o.counts.posted)} hint="Approved by you or an auto-post rule" />
        <StatCard label="Already in your books" value={String(o.counts.matched)} hint="Matched by amount and date" />
        <StatCard label="Rules" value={String(rules.length)} hint={`${rules.filter((r) => r.autoPost).length} post without asking`} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Month-end readiness</CardTitle>
            <CardDescription>What still stands between you and a clean close.</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-2">
          {o.readiness.map((r) => (
            <div key={r.label} className="flex items-start gap-3 text-sm">
              <Badge tone={r.ok ? 'success' : 'warning'}>{r.ok ? 'Done' : 'Open'}</Badge>
              <div>
                <p className="font-medium text-slate-900">{r.label}</p>
                <p className="text-slate-500">{r.detail}</p>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Import a statement</CardTitle>
            <CardDescription>
              A CSV with Date, Description and Amount (money out is negative). There is no live bank feed yet, so export the file from your bank. Uploading the same file twice is safe: lines already seen are skipped.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="bkAccount">Account</Label>
            <Select id="bkAccount" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.Id} value={a.Id}>
                  {a.Name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bkFile">Statement file</Label>
            <input id="bkFile" type="file" accept=".csv,text/csv" onChange={onFile} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
          </div>
          <div>
            <Label htmlFor="bkText">Or paste the CSV contents</Label>
            <Textarea id="bkText" rows={5} value={csvText} onChange={(e) => setCsvText(e.target.value)} className="font-mono text-xs" placeholder={'Date,Description,Amount\n2026-09-03,ADOBE CREATIVE CLOUD,-54.99'} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{o.aiEnabled ? 'Claude suggests accounts for lines no rule or past approval covers.' : 'Claude is off (no Anthropic key), so only your rules and past approvals suggest accounts.'}</p>
            <Button
              loading={busy === 'import'}
              disabled={!csvText.trim()}
              onClick={() =>
                act('import', async () => {
                  const r = (await call('/api/bookkeeping/import', 'POST', { accountId, csvText })).result;
                  setCsvText('');
                  return `${r.added} new line${r.added === 1 ? '' : 's'} (${r.duplicates} already seen). ${r.processed.matched} already booked, ${r.processed.autoPosted} auto-posted, ${r.processed.toReview} for review.`;
                })
              }
            >
              Import and sort
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Review queue ({o.queue.length})</CardTitle>
            <CardDescription>Check each suggestion, change the account if needed, then approve. Approving books an expense from the bank or card account.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" loading={busy === 'recheck'} onClick={() => act('recheck', async () => { const r = (await call('/api/bookkeeping/run', 'POST')).result; return `Re-checked: ${r.matched} matched, ${r.toReview} to review.`; })}>
              Re-check
            </Button>
            <Button size="sm" loading={busy === 'all'} disabled={o.confidentWaiting === 0} onClick={() => act('all', async () => { const r = (await call('/api/bookkeeping/approve-confident', 'POST')).result; return `Booked ${r.posted} line${r.posted === 1 ? '' : 's'}${r.failed ? `, ${r.failed} could not be booked` : ''}.`; })}>
              Approve {o.confidentWaiting} ready
            </Button>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {o.queue.length === 0 ? (
            <div className="p-6">
              <EmptyState title="Nothing waiting" description="Import a statement and anything that needs a decision will show up here." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Description</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Book to</Th>
                  <Th>Why</Th>
                  <Th>&nbsp;</Th>
                </Tr>
              </Thead>
              <Tbody>
                {o.queue.map((t) => {
                  const incoming = t.amount >= 0;
                  const picked = optionId(t);
                  return (
                    <Tr key={t.id}>
                      <Td className="whitespace-nowrap">{formatDate(t.date)}</Td>
                      <Td>
                        <p>{t.description}</p>
                        <p className="text-xs text-slate-500">{t.accountName}</p>
                      </Td>
                      <Td className="text-right whitespace-nowrap">{formatCurrency(t.amount)}</Td>
                      <Td>
                        {incoming ? (
                          <span className="text-xs text-slate-500">Money in</span>
                        ) : (
                          <div className="space-y-1">
                            <Select aria-label={`Account for ${t.description}`} value={picked} onChange={(e) => setChoice({ ...choice, [t.id]: e.target.value })}>
                              <option value="">Choose an account…</option>
                              {options.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </Select>
                            <label className="flex items-center gap-1.5 text-xs text-slate-500">
                              <input type="checkbox" checked={makeRule[t.id] ?? false} onChange={(e) => setMakeRule({ ...makeRule, [t.id]: e.target.checked })} />
                              Remember for this merchant
                            </label>
                          </div>
                        )}
                      </Td>
                      <Td className="min-w-[14rem] max-w-xs !whitespace-normal text-xs text-slate-500">
                        {t.confidence !== null && t.source ? (
                          <Badge tone={t.confidence >= 90 ? 'success' : 'warning'}>
                            {SOURCE[t.source] ?? t.source} · {t.confidence}%
                          </Badge>
                        ) : null}
                        <p className="mt-1">{t.reason}</p>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="flex gap-1.5">
                          {incoming ? null : (
                            <Button size="sm" disabled={!picked} loading={busy === t.id} onClick={() => act(t.id, async () => { await call(`/api/bookkeeping/transactions/${t.id}`, 'POST', { action: 'approve', accountId: picked, vendorId: t.suggestedVendorId ?? undefined, makeRule: makeRule[t.id] === true }); return 'Booked.'; })}>
                              Approve
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" disabled={busy === t.id} onClick={() => act(t.id, async () => { await call(`/api/bookkeeping/transactions/${t.id}`, 'POST', { action: 'ignore' }); return 'Set aside.'; })}>
                            Ignore
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rules</CardTitle>
            <CardDescription>
              A rule books a matching merchant to an account. Leave &quot;post without asking&quot; off and the line still waits for you; turn it on only for payments you never want to look at. Money coming in is never auto-booked.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          {rules.length === 0 ? (
            <p className="text-sm text-slate-500">No rules yet. Tick &quot;Remember for this merchant&quot; when you approve a line, or add one below.</p>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>When the description contains</Th>
                  <Th>Book to</Th>
                  <Th>Used</Th>
                  <Th>Post without asking</Th>
                  <Th>&nbsp;</Th>
                </Tr>
              </Thead>
              <Tbody>
                {rules.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium">{r.pattern}</Td>
                    <Td>{r.accountName}</Td>
                    <Td>{r.hits}</Td>
                    <Td>
                      <input type="checkbox" aria-label={`Post ${r.pattern} without asking`} checked={r.autoPost} onChange={(e) => act(`r${r.id}`, async () => { await call(`/api/bookkeeping/rules/${r.id}`, 'PATCH', { autoPost: e.target.checked }); })} />
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => act(`r${r.id}`, async () => { await call(`/api/bookkeeping/rules/${r.id}`, 'DELETE'); return 'Rule removed.'; })}>
                        Remove
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
            <div>
              <Label htmlFor="ruleText">Description contains</Label>
              <Input id="ruleText" value={rulePattern} onChange={(e) => setRulePattern(e.target.value)} placeholder="ADOBE" />
            </div>
            <div>
              <Label htmlFor="ruleAccount">Book to</Label>
              <Select id="ruleAccount" value={ruleAccount} onChange={(e) => setRuleAccount(e.target.value)}>
                <option value="">Choose an account…</option>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-600">
              <input type="checkbox" checked={ruleAuto} onChange={(e) => setRuleAuto(e.target.checked)} />
              Post without asking
            </label>
            <Button disabled={!rulePattern.trim() || !ruleAccount} loading={busy === 'rule'} onClick={() => act('rule', async () => { await call('/api/bookkeeping/rules', 'POST', { pattern: rulePattern, accountId: ruleAccount, autoPost: ruleAuto }); setRulePattern(''); setRuleAuto(false); return 'Rule added. Re-check applies it to lines already waiting.'; })}>
              Add rule
            </Button>
          </div>
        </CardBody>
      </Card>

      {o.recent.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recently handled</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            <Table>
              <Thead>
                <Tr>
                  <Th>Date</Th>
                  <Th>Description</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Outcome</Th>
                </Tr>
              </Thead>
              <Tbody>
                {o.recent.map((t) => (
                  <Tr key={t.id}>
                    <Td className="whitespace-nowrap">{formatDate(t.date)}</Td>
                    <Td>{t.description}</Td>
                    <Td className="text-right">{formatCurrency(t.amount)}</Td>
                    <Td className="text-slate-500">{t.status === 'matched' ? `Already booked: ${t.matchedRef}` : 'Booked as an expense'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
