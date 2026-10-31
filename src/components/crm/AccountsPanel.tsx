'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Table, Tbody, Td, Th, Thead, Tr } from '@/components/ui/Table';
import { OPEN_STAGES, ago, stageInfo, type Contact, type Deal } from '@/lib/crm/model';
import { formatCurrency } from '@/lib/format';

/** Step 2b, accounts: contacts grouped by company, with what is open and won for each, so one account reads as one picture. */
export function AccountsPanel({
  contacts, deals, onOpenContact, onOpenDeal,
}: {
  contacts: Contact[];
  deals: Deal[];
  onOpenContact: (id: string) => void;
  onOpenDeal: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const accounts = useMemo(() => {
    const map = new Map<string, { name: string; people: Contact[]; deals: Deal[] }>();
    for (const c of contacts) {
      if (c.status === 'archived' || !c.company?.trim()) continue;
      const key = c.company.trim().toLowerCase();
      const a = map.get(key) ?? { name: c.company.trim(), people: [], deals: [] };
      a.people.push(c);
      a.deals.push(...deals.filter((d) => d.contactId === c.id));
      map.set(key, a);
    }
    return [...map.entries()].map(([key, a]) => {
      const open = a.deals.filter((d) => OPEN_STAGES.includes(d.stage));
      const won = a.deals.filter((d) => d.stage === 'won');
      const last = a.people.map((p) => p.lastContactAt).filter(Boolean).sort().pop() ?? null;
      return { key, ...a, openValue: open.reduce((s, d) => s + d.value, 0), wonValue: won.reduce((s, d) => s + d.value, 0), openCount: open.length, last, customer: a.people.some((p) => p.status === 'customer') };
    }).sort((a, b) => b.openValue + b.wonValue - (a.openValue + a.wonValue) || a.name.localeCompare(b.name));
  }, [contacts, deals]);

  const q = query.trim().toLowerCase();
  const shown = accounts.filter((a) => !q || a.name.toLowerCase().includes(q) || a.people.some((p) => p.name.toLowerCase().includes(q)));

  return (
    <div className="space-y-3">
      <Input className="max-w-xs" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search accounts or people…" aria-label="Search accounts" />
      <Card>
        {shown.length === 0 ? <p className="p-6 text-sm text-slate-500">{accounts.length === 0 ? 'Accounts appear here once contacts have a company.' : 'No accounts match.'}</p> : (
          <Table>
            <Thead><Tr><Th>Account</Th><Th className="text-right">People</Th><Th className="text-right">Open deals</Th><Th className="text-right">Open value</Th><Th className="text-right">Won value</Th><Th>Last contact</Th></Tr></Thead>
            <Tbody>
              {shown.flatMap((a) => {
                const isOpen = openKey === a.key;
                const row = (
                  <Tr key={a.key} className="cursor-pointer" onClick={() => setOpenKey(isOpen ? null : a.key)}>
                    <Td className="font-medium text-slate-900">{a.name} {a.customer ? <Badge tone="success">customer</Badge> : null}</Td>
                    <Td className="text-right">{a.people.length}</Td>
                    <Td className="text-right">{a.openCount}</Td>
                    <Td className="text-right">{formatCurrency(a.openValue)}</Td>
                    <Td className="text-right">{formatCurrency(a.wonValue)}</Td>
                    <Td className="text-xs text-slate-600">{a.last ? ago(a.last) : '—'}</Td>
                  </Tr>
                );
                if (!isOpen) return [row];
                return [row, (
                  <Tr key={`${a.key}-detail`}>
                    <Td colSpan={6} className="bg-slate-50">
                      <div className="grid gap-4 py-1 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-semibold text-slate-700">People</p>
                          <ul className="space-y-1">{a.people.map((p) => (
                            <li key={p.id}><button type="button" className="text-left text-sm text-slate-900 hover:underline" onClick={() => onOpenContact(p.id)}>{p.name}</button>
                              <span className="text-xs text-slate-500"> {p.jobTitle ? `· ${p.jobTitle} ` : ''}· {p.status}</span></li>
                          ))}</ul>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold text-slate-700">Deals</p>
                          {a.deals.length === 0 ? <p className="text-xs text-slate-500">No deals yet.</p> : (
                            <ul className="space-y-1">{a.deals.map((d) => (
                              <li key={d.id}><button type="button" className="text-left text-sm text-slate-900 hover:underline" onClick={() => onOpenDeal(d.id)}>{d.title}</button>
                                <span className="text-xs text-slate-500"> · {formatCurrency(d.value, d.currency)} · {stageInfo(d.stage).label}</span></li>
                            ))}</ul>
                          )}
                        </div>
                      </div>
                    </Td>
                  </Tr>
                )];
              })}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
