'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Select, Input } from '@/components/ui/Field';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import type { RecurringFrequency } from '@/lib/accounting/recurring';
import { useToast } from '@/components/ui/Toast';

interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  docType: 'invoice' | 'estimate';
  customerId: string;
  customerName: string;
  email?: string;
  lines: LineItemInput[];
  onCreated?: () => void;
}

export function ScheduleDialog({ open, onClose, docType, customerId, customerName, email, lines, onCreated }: ScheduleDialogProps) {
  const { notify } = useToast();
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [autoSend, setAutoSend] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, customerId, customerName, email, lines, frequency, startDate, autoSend }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to create schedule.');
      }
      notify(`Recurring ${docType} scheduled.`);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Schedule a recurring ${docType}`}
      description={`For ${customerName}. A new ${docType} will be created automatically on this schedule.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="frequency">Repeats</Label>
            <Select id="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="startDate">Starting</Label>
            <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
          Automatically email it to {customerName} each time
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            Create schedule
          </Button>
        </div>
      </form>
    </Modal>
  );
}
