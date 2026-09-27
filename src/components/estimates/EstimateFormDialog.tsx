'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input } from '@/components/ui/Field';
import { CustomerSelect } from '@/components/documents/CustomerSelect';
import { LineItemsEditor } from '@/components/documents/LineItemsEditor';
import { useToast } from '@/components/ui/Toast';
import type { Customer } from '@/lib/quickbooks/customers';
import type { Product } from '@/lib/quickbooks/items';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import type { Estimate } from '@/lib/quickbooks/estimates';

interface EstimateFormDialogProps {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  products: Product[];
  estimate?: Estimate;
  onSaved: () => void;
}

export function EstimateFormDialog({ open, onClose, customers, products, estimate, onSaved }: EstimateFormDialogProps) {
  const { notify } = useToast();
  const isEdit = Boolean(estimate);

  const [customerId, setCustomerId] = useState(estimate?.CustomerRef.value ?? '');
  const [customerName, setCustomerName] = useState(estimate?.CustomerRef.name ?? '');
  const [email, setEmail] = useState(estimate?.BillEmail?.Address ?? '');
  const [expirationDate, setExpirationDate] = useState(estimate?.ExpirationDate ?? '');
  const [lines, setLines] = useState<LineItemInput[]>(
    estimate?.Line.map((l) => ({
      itemId: l.SalesItemLineDetail.ItemRef.value,
      itemName: l.SalesItemLineDetail.ItemRef.name,
      quantity: l.SalesItemLineDetail.Qty,
      unitPrice: l.SalesItemLineDetail.UnitPrice,
      description: l.Description,
    })) ?? [{ itemId: '', quantity: 1, unitPrice: 0 }],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.itemId);
      if (validLines.length === 0) throw new Error('Add at least one line item.');

      const res = await fetch(isEdit ? `/api/estimates/${estimate!.Id}` : '/api/estimates', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { syncToken: estimate!.SyncToken, expirationDate, email: email || undefined, lines: validLines }
            : { customerId, customerName, email: email || undefined, expirationDate: expirationDate || undefined, lines: validLines },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save estimate.');
      }
      notify(isEdit ? 'Estimate updated.' : 'Estimate created.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit estimate' : 'New estimate'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="customer">Customer</Label>
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
            <Label htmlFor="expirationDate">Expires</Label>
            <Input id="expirationDate" type="date" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
        </div>
        <div>
          <Label>Line items</Label>
          <LineItemsEditor products={products} lines={lines} onChange={setLines} />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEdit ? 'Save changes' : 'Create estimate'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
