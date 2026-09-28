'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input } from '@/components/ui/Field';
import { CustomerSelect } from '@/components/documents/CustomerSelect';
import { LineItemsEditor } from '@/components/documents/LineItemsEditor';
import { CurrencyExchangeRateField } from '@/components/documents/CurrencyExchangeRateField';
import { useToast } from '@/components/ui/Toast';
import type { Customer } from '@/lib/quickbooks/customers';
import type { Product } from '@/lib/quickbooks/items';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import type { Invoice } from '@/lib/quickbooks/invoices';

interface InvoiceFormDialogProps {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  products: Product[];
  invoice?: Invoice;
  homeCurrencyCode?: string;
  onSaved: () => void;
}

export function InvoiceFormDialog({
  open,
  onClose,
  customers,
  products,
  invoice,
  homeCurrencyCode,
  onSaved,
}: InvoiceFormDialogProps) {
  const { notify } = useToast();
  const isEdit = Boolean(invoice);

  const [customerId, setCustomerId] = useState(invoice?.CustomerRef.value ?? '');
  const [customerName, setCustomerName] = useState(invoice?.CustomerRef.name ?? '');
  const [customerCurrency, setCustomerCurrency] = useState(invoice?.CurrencyRef);
  const [exchangeRate, setExchangeRate] = useState(invoice?.ExchangeRate ?? 1);
  const [email, setEmail] = useState(invoice?.BillEmail?.Address ?? '');
  const [dueDate, setDueDate] = useState(invoice?.DueDate ?? '');
  const [lines, setLines] = useState<LineItemInput[]>(
    invoice?.Line.map((l) => ({
      itemId: l.SalesItemLineDetail.ItemRef.value,
      itemName: l.SalesItemLineDetail.ItemRef.name,
      quantity: l.SalesItemLineDetail.Qty,
      unitPrice: l.SalesItemLineDetail.UnitPrice,
      description: l.Description,
    })) ?? [{ itemId: '', quantity: 1, unitPrice: 0 }],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isForeignCurrency = Boolean(
    !isEdit && homeCurrencyCode && customerCurrency && customerCurrency.value !== homeCurrencyCode,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validLines = lines.filter((l) => l.itemId);
      if (validLines.length === 0) throw new Error('Add at least one line item.');

      const res = await fetch(isEdit ? `/api/invoices/${invoice!.Id}` : '/api/invoices', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { syncToken: invoice!.SyncToken, dueDate, email: email || undefined, lines: validLines, customerId, customerName }
            : {
                customerId,
                customerName,
                email: email || undefined,
                dueDate: dueDate || undefined,
                lines: validLines,
                currencyCode: isForeignCurrency ? customerCurrency!.value : undefined,
                exchangeRate: isForeignCurrency ? exchangeRate : undefined,
              },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save invoice.');
      }
      notify(isEdit ? 'Invoice updated.' : 'Invoice created.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit invoice' : 'New invoice'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label htmlFor="customer">Customer</Label>
            <CustomerSelect
              customers={customers}
              value={customerId}
              onChange={(id, name, defaultEmail, currencyRef) => {
                setCustomerId(id);
                setCustomerName(name);
                setCustomerCurrency(currencyRef);
                setExchangeRate(1);
                if (defaultEmail && !email) setEmail(defaultEmail);
              }}
            />
          </div>
          <div>
            <Label htmlFor="dueDate">Due date</Label>
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        {isForeignCurrency ? (
          <CurrencyExchangeRateField
            currencyCode={customerCurrency!.value}
            homeCurrencyCode={homeCurrencyCode}
            exchangeRate={exchangeRate}
            onExchangeRateChange={setExchangeRate}
          />
        ) : null}
        <div>
          <Label htmlFor="email">Billing email</Label>
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
            {isEdit ? 'Save changes' : 'Create invoice'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
