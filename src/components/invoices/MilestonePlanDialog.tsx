'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input } from '@/components/ui/Field';
import { CustomerSelect } from '@/components/documents/CustomerSelect';
import { LineItemsEditor } from '@/components/documents/LineItemsEditor';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Customer } from '@/lib/accounting/customers';
import type { Product } from '@/lib/accounting/products';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';

interface MilestoneRow {
  label: string;
  percent: number;
  dueDate: string;
}

function defaultMilestones(): MilestoneRow[] {
  return [
    { label: 'Deposit', percent: 50, dueDate: '' },
    { label: 'On completion', percent: 50, dueDate: '' },
  ];
}

export function MilestonePlanDialog({
  open,
  onClose,
  customers,
  products,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  products: Product[];
  onCreated: () => void;
}) {
  const { notify } = useToast();
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [email, setEmail] = useState('');
  const [lines, setLines] = useState<LineItemInput[]>([{ itemId: '', quantity: 1, unitPrice: 0 }]);
  const [milestones, setMilestones] = useState<MilestoneRow[]>(defaultMilestones());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contractTotal = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const percentTotal = milestones.reduce((sum, m) => sum + m.percent, 0);

  function updateMilestone(index: number, patch: Partial<MilestoneRow>) {
    const next = milestones.slice();
    next[index] = { ...next[index], ...patch };
    setMilestones(next);
  }

  function addMilestone() {
    setMilestones([...milestones, { label: '', percent: 0, dueDate: '' }]);
  }

  function removeMilestone(index: number) {
    setMilestones(milestones.filter((_, i) => i !== index));
  }

  function resetAndClose() {
    setCustomerId('');
    setCustomerName('');
    setEmail('');
    setLines([{ itemId: '', quantity: 1, unitPrice: 0 }]);
    setMilestones(defaultMilestones());
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.itemId);
      if (validLines.length === 0) throw new Error('Add at least one line item for the full contract value.');
      const validMilestones = milestones.filter((m) => m.label.trim() && m.percent > 0);
      if (validMilestones.length < 2) throw new Error('Add at least two milestones.');

      const res = await fetch('/api/invoices/milestone-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          customerName,
          email: email || undefined,
          lines: validLines,
          milestones: validMilestones.map((m) => ({ label: m.label, percent: m.percent, dueDate: m.dueDate || undefined })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to create milestone plan.');
      }
      notify(`${validMilestones.length} milestone invoices created.`);
      onCreated();
      resetAndClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="New milestone plan" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-500">
          Split one contract into several invoices by percentage — e.g. a 50% deposit and 50% on completion. Each
          becomes an ordinary invoice you can edit, send, and get paid on independently.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="milestoneCustomer">Customer</Label>
            <CustomerSelect
              customers={customers}
              value={customerId}
              onChange={(id, name, defaultEmail) => {
                setCustomerId(id);
                setCustomerName(name);
                if (defaultEmail && !email) setEmail(defaultEmail);
              }}
            />
          </div>
          <div>
            <Label htmlFor="milestoneEmail">Billing email</Label>
            <Input
              id="milestoneEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
            />
          </div>
        </div>

        <div>
          <Label>Full contract value (line items)</Label>
          <LineItemsEditor products={products} lines={lines} onChange={setLines} />
        </div>

        <div>
          <Label>Milestones</Label>
          <div className="space-y-2">
            {milestones.map((milestone, index) => (
              <div key={index} className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-12 sm:col-span-5">
                  <Input
                    placeholder="e.g. Deposit"
                    value={milestone.label}
                    onChange={(e) => updateMilestone(index, { label: e.target.value })}
                    required
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="1"
                    value={milestone.percent}
                    onChange={(e) => updateMilestone(index, { percent: Number(e.target.value) })}
                    required
                  />
                </div>
                <div className="col-span-5 sm:col-span-3">
                  <Input
                    type="date"
                    value={milestone.dueDate}
                    onChange={(e) => updateMilestone(index, { dueDate: e.target.value })}
                  />
                </div>
                <div className="col-span-2 text-right text-sm font-medium text-slate-700 sm:col-span-1">
                  {formatCurrency((contractTotal * milestone.percent) / 100)}
                </div>
                <div className="col-span-1 text-right">
                  <button
                    type="button"
                    onClick={() => removeMilestone(index)}
                    className="text-slate-400 hover:text-red-600"
                    aria-label="Remove milestone"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between">
            <Button type="button" variant="secondary" size="sm" onClick={addMilestone}>
              + Add milestone
            </Button>
            <p className={`text-sm font-semibold ${percentTotal === 100 ? 'text-slate-900' : 'text-red-600'}`}>
              {percentTotal}% of 100%
            </p>
          </div>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={resetAndClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create invoices
          </Button>
        </div>
      </form>
    </Modal>
  );
}
