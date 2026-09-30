'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tr, Td } from '@/components/ui/Table';
import { formatDate } from '@/lib/format';
import type { AuditLogEntry } from '@/lib/accounting/auditLog';

const ACTION_TONE: Record<string, 'success' | 'warning' | 'danger'> = {
  create: 'success',
  update: 'warning',
  delete: 'danger',
};

const ENTITY_LABEL: Record<string, string> = {
  journal_entry: 'Journal entry',
  account: 'Account',
};

export function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Tr>
        <Td className="whitespace-normal">
          {formatDate(entry.CreatedAt)}{' '}
          <span className="text-xs text-slate-400">{new Date(entry.CreatedAt).toLocaleTimeString()}</span>
        </Td>
        <Td className="whitespace-normal">
          {ENTITY_LABEL[entry.EntityType] ?? entry.EntityType}
          <p className="text-xs text-slate-400">{entry.EntityId}</p>
        </Td>
        <Td>
          <Badge tone={ACTION_TONE[entry.Action] ?? 'neutral'}>{entry.Action}</Badge>
        </Td>
        <Td className="text-right">
          <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide details' : 'View details'}
          </Button>
        </Td>
      </Tr>
      {expanded ? (
        <Tr>
          <Td colSpan={4} className="whitespace-normal bg-slate-50/60">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Before</p>
                <pre className="max-h-64 overflow-auto rounded-lg bg-white p-2 text-xs text-slate-700">
                  {entry.Before ? JSON.stringify(entry.Before, null, 2) : '—'}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">After</p>
                <pre className="max-h-64 overflow-auto rounded-lg bg-white p-2 text-xs text-slate-700">
                  {entry.After ? JSON.stringify(entry.After, null, 2) : '—'}
                </pre>
              </div>
            </div>
          </Td>
        </Tr>
      ) : null}
    </>
  );
}
