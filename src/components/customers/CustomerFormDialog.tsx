'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import type { Customer } from '@/lib/quickbooks/customers';
import type { Currency } from '@/lib/quickbooks/currencies';

export function CustomerFormDialog({
  open,
  onClose,
  customer,
  currencies,
  homeCurrency,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  customer?: Customer;
  currencies: Currency[];
  homeCurrency: Currency | null;
  onSaved: () => void;
}) {
  const { notify } = useToast();
  const isEdit = Boolean(customer);

  const [displayName, setDisplayName] = useState(customer?.DisplayName ?? '');
  const [companyName, setCompanyName] = useState(customer?.CompanyName ?? '');
  const [email, setEmail] = useState(customer?.PrimaryEmailAddr?.Address ?? '');
  const [phone, setPhone] = useState(customer?.PrimaryPhone?.FreeFormNumber ?? '');
  const [currencyCode, setCurrencyCode] = useState(customer?.CurrencyRef?.value ?? homeCurrency?.code ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only companies with multi-currency enabled have more than one option here.
  const showCurrencyPicker = currencies.length > 1;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(isEdit ? `/api/customers/${customer!.Id}` : '/api/customers', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? {
                syncToken: customer!.SyncToken,
                displayName,
                companyName: companyName || undefined,
                email: email || undefined,
                phone: phone || undefined,
              }
            : {
                displayName,
                companyName: companyName || undefined,
                email: email || undefined,
                phone: phone || undefined,
                currencyCode: showCurrencyPicker ? currencyCode || undefined : undefined,
              },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save customer.');
      }
      notify(isEdit ? 'Customer updated.' : 'Customer added.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit customer' : 'Add a customer'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="displayName">Name</Label>
          <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="companyName">Company (optional)</Label>
          <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        {showCurrencyPicker ? (
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Select
              id="currency"
              value={currencyCode}
              disabled={isEdit}
              onChange={(e) => setCurrencyCode(e.target.value)}
            >
              {currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.name} ({currency.code})
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">Can&apos;t be changed once this customer has a transaction.</p>
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEdit ? 'Save changes' : 'Add customer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
