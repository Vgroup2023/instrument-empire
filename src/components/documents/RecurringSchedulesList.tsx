'use client';

import { useEffect, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { RecurringTemplate } from '@/lib/quickbooks/recurring';

export function RecurringSchedulesList({ docType }: { docType: 'invoice' | 'estimate' }) {
  const { notify } = useToast();
  const [templates, setTemplates] = useState<RecurringTemplate[] | null>(null);

  async function load() {
    const res = await fetch('/api/recurring', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setTemplates((data.templates as RecurringTemplate[]).filter((t) => t.docType === docType));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, no external state to sync from
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!templates || templates.length === 0) return null;

  async function toggleActive(template: RecurringTemplate) {
    await fetch(`/api/recurring/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !template.active }),
    });
    load();
  }

  async function remove(template: RecurringTemplate) {
    await fetch(`/api/recurring/${template.id}`, { method: 'DELETE' });
    notify('Schedule removed.');
    load();
  }

  const totalAmount = (t: RecurringTemplate) => t.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  return (
    <Card className="mt-6">
      <CardHeader>
        <div>
          <CardTitle>Scheduled {docType === 'invoice' ? 'invoices' : 'estimates'}</CardTitle>
          <CardDescription>Recurring documents this app creates automatically on schedule.</CardDescription>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <Table>
          <Thead>
            <Tr>
              <Th>Customer</Th>
              <Th>Repeats</Th>
              <Th>Next run</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {templates.map((template) => (
              <Tr key={template.id}>
                <Td className="font-medium text-slate-900">{template.customerName}</Td>
                <Td className="capitalize">{template.frequency}</Td>
                <Td>{formatDate(template.nextRunDate)}</Td>
                <Td className="text-right">{formatCurrency(totalAmount(template))}</Td>
                <Td>
                  <Badge tone={template.active ? 'success' : 'neutral'}>
                    {template.active ? 'Active' : 'Paused'}
                  </Badge>
                  {template.lastError ? (
                    <Badge tone="danger" className="ml-1">
                      Last run failed
                    </Badge>
                  ) : null}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(template)}>
                      {template.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(template)}>
                      Delete
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </CardBody>
    </Card>
  );
}
