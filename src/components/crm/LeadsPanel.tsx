'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { OPEN_STAGES, ago, leadScore, type Activity, type Contact, type Deal } from '@/lib/crm/model';
import { crmCall } from './api';

/**
 * Step 1, lead management: everyone who is not yet a customer, split into new and qualified leads, scored so the best
 * to call come first. Qualify a lead, or turn it into a deal, in one click.
 */
export function LeadsPanel({
  contacts, deals, activities, actor, onSaved, onNewDeal, onOpenContact,
}: {
  contacts: Contact[];
  deals: Deal[];
  activities: Activity[];
  actor: string;
  onSaved: (c: Contact) => void;
  onNewDeal: (contactId: string) => void;
  onOpenContact: (id: string) => void;
}) {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => contacts
    .filter((c) => c.status === 'lead' || c.status === 'qualified')
    .map((c) => {
      const acts = activities.filter((a) => a.contactId === c.id && a.kind !== 'created').length;
      const openValue = deals.filter((d) => d.contactId === c.id && OPEN_STAGES.includes(d.stage)).reduce((s, d) => s + d.value, 0);
      const hasOpenDeal = deals.some((d) => d.contactId === c.id && OPEN_STAGES.includes(d.stage));
      return { c, score: leadScore(c, acts, openValue), hasOpenDeal };
    })
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name)), [contacts, deals, activities]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy('add');
    try {
      const { contact } = await crmCall<{ contact: Contact }>('/api/crm/contacts', 'POST', {
        name: name.trim(), email: email.trim() || null, company: company.trim() || null, status: 'lead', source: 'other', actor,
      });
      onSaved(contact);
      setName(''); setEmail(''); setCompany('');
      notify('Lead added.');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not add the lead.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function qualify(c: Contact) {
    setBusy(c.id);
    try {
      const { contact } = await crmCall<{ contact: Contact }>(`/api/crm/contacts/${c.id}`, 'PATCH', { status: 'qualified', actor });
      onSaved(contact);
      notify(`${c.name} is now a qualified lead.`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not qualify the lead.', 'error');
    } finally {
      setBusy(null);
    }
  }

  const groups = [
    { key: 'lead', title: 'New leads', hint: 'Not yet contacted or checked. Call or email, then qualify.', color: '#64748b', list: rows.filter((r) => r.c.status === 'lead') },
    { key: 'qualified', title: 'Qualified leads', hint: 'A real fit. Turn each into a deal.', color: '#16a34a', list: rows.filter((r) => r.c.status === 'qualified') },
  ];

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <label className="min-w-[160px] flex-1 text-xs font-medium text-slate-700">Name
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Jaydin Gross" />
          </label>
          <label className="min-w-[180px] flex-1 text-xs font-medium text-slate-700">Email
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="name@company.com" />
          </label>
          <label className="min-w-[140px] flex-1 text-xs font-medium text-slate-700">Company
            <Input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} placeholder="Company" />
          </label>
          <Button type="submit" loading={busy === 'add'} disabled={!name.trim()}>+ Add lead</Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Leads also arrive on their own from email (Gmail or Outlook bridge), texts and calls. See Integrations.</p>
      </Card>

      {groups.map((g) => (
        <section key={g.key} aria-label={g.title}>
          <div className="mb-1.5 flex items-baseline gap-2" style={{ borderLeft: `4px solid ${g.color}`, paddingLeft: 8 }}>
            <h3 className="text-[15px] font-semibold text-slate-900">{g.title}</h3>
            <span className="text-xs text-slate-500">{g.list.length} · {g.hint}</span>
          </div>
          <Card>
            {g.list.length === 0 ? <p className="p-5 text-sm text-slate-500">Nothing here yet.</p> : (
              <Table>
                <Thead><Tr><Th>Lead</Th><Th>Owner</Th><Th>Company</Th><Th>Source</Th><Th>Last contact</Th><Th>Score</Th><Th className="text-right">Next step</Th></Tr></Thead>
                <Tbody>
                  {g.list.map(({ c, score, hasOpenDeal }) => (
                    <Tr key={c.id}>
                      <Td className="font-medium text-slate-900">
                        <button type="button" className="text-left hover:underline" onClick={() => onOpenContact(c.id)}>{c.name}</button>
                        <p className="text-xs font-normal text-slate-500">{c.email ?? c.phone ?? ''}{c.jobTitle ? ` · ${c.jobTitle}` : ''}</p>
                      </Td>
                      <Td className="text-xs text-slate-600">{c.owner ?? '—'}</Td>
                      <Td>{c.company ?? '—'}</Td>
                      <Td className="capitalize">{c.source}</Td>
                      <Td className="text-xs text-slate-600">{c.doNotContact ? <Badge tone="danger">do not contact</Badge> : c.lastContactAt ? ago(c.lastContactAt) : 'never'}</Td>
                      <Td><Badge tone={score >= 70 ? 'success' : score >= 40 ? 'warning' : 'neutral'}>{score}</Badge></Td>
                      <Td className="text-right">
                        <span className="inline-flex gap-1.5">
                          {c.status === 'lead' ? <Button variant="secondary" loading={busy === c.id} onClick={() => void qualify(c)}>Qualify</Button> : null}
                          {hasOpenDeal ? <Badge tone="brand">in pipeline</Badge> : <Button onClick={() => onNewDeal(c.id)}>Make a deal</Button>}
                        </span>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}
          </Card>
        </section>
      ))}
    </div>
  );
}
