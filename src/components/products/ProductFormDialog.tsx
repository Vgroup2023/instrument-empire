'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import type { Product, IncomeAccount } from '@/lib/accounting/products';

export function ProductFormDialog({
  open,
  onClose,
  product,
  incomeAccounts,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  product?: Product;
  incomeAccounts: IncomeAccount[];
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const isEdit = Boolean(product);

  const [name, setName] = useState(product?.Name ?? '');
  const [type] = useState<'Service' | 'Inventory' | 'NonInventory'>(product?.Type ?? 'Service');
  const [unitPrice, setUnitPrice] = useState(String(product?.UnitPrice ?? 0));
  const [description, setDescription] = useState(product?.Description ?? '');
  const [incomeAccountId, setIncomeAccountId] = useState(
    product?.IncomeAccountRef?.value ?? incomeAccounts[0]?.Id ?? '',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const incomeAccount = incomeAccounts.find((a) => a.Id === incomeAccountId);
      const res = await fetch(isEdit ? `/api/products/${product!.Id}` : '/api/products', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? {
                syncToken: product!.SyncToken,
                name,
                unitPrice: Number(unitPrice) || 0,
                description: description || undefined,
                incomeAccountId,
                incomeAccountName: incomeAccount?.Name,
              }
            : {
                name,
                type,
                unitPrice: Number(unitPrice) || 0,
                description: description || undefined,
                incomeAccountId,
                incomeAccountName: incomeAccount?.Name,
              },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save product.');
      }
      notify(isEdit ? 'Product/service updated.' : 'Product/service added.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit product or service' : 'Add a product or service'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="type">Type</Label>
            <Select id="type" value={type} disabled>
              <option value="Service">Service</option>
              <option value="NonInventory">Non-inventory product</option>
              <option value="Inventory">Inventory product</option>
            </Select>
            {isEdit ? <p className="mt-1 text-xs text-slate-500">Type can&apos;t be changed after creation.</p> : null}
          </div>
          <div>
            <Label htmlFor="unitPrice">Price</Label>
            <Input
              id="unitPrice"
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="incomeAccount">Posts revenue to</Label>
          {incomeAccounts.length > 0 ? (
            <Select id="incomeAccount" value={incomeAccountId} onChange={(e) => setIncomeAccountId(e.target.value)} required>
              {incomeAccounts.map((account) => (
                <option key={account.Id} value={account.Id}>
                  {account.Name}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-sm text-red-600">
              No income accounts found — add one on the Chart of accounts page first.
            </p>
          )}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading} disabled={incomeAccounts.length === 0}>
            {isEdit ? 'Save changes' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
