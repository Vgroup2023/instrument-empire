'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Textarea } from '@/components/ui/Field';
import { CustomerSelect } from '@/components/documents/CustomerSelect';
import { LineItemsEditor, blankLines } from '@/components/documents/LineItemsEditor';
import { CurrencyExchangeRateField } from '@/components/documents/CurrencyExchangeRateField';
import { useToast } from '@/components/ui/Toast';
import type { Customer } from '@/lib/accounting/customers';
import type { Product } from '@/lib/accounting/products';
import type { LineItemInput } from '@/lib/quickbooks/salesTypes';
import type { Invoice, InvoiceTemplate } from '@/lib/accounting/invoices';
import { formatCurrency } from '@/lib/format';
import { INVOICE_LOGO } from '@/lib/invoiceLogo';

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
    })) ?? blankLines(10),
  );
  const [poNumber, setPoNumber] = useState(invoice?.PoNumber ?? '');
  const [billToAddress, setBillToAddress] = useState(invoice?.BillToAddress ?? '');
  const [shipTo, setShipTo] = useState(invoice?.ShipTo ?? '');
  const [paymentTerms, setPaymentTerms] = useState(invoice?.PaymentTerms ?? '');
  const [notes, setNotes] = useState(invoice?.Notes ?? '');
  const [template, setTemplate] = useState<InvoiceTemplate>(invoice?.Template ?? 'pro-forma');
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
      const validLines = lines.filter((l) => l.itemId || l.description?.trim());
      if (validLines.length === 0) throw new Error('Add at least one line item.');

      const res = await fetch(isEdit ? `/api/invoices/${invoice!.Id}` : '/api/invoices', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? {
                syncToken: invoice!.SyncToken,
                dueDate,
                email: email || undefined,
                lines: validLines,
                customerId,
                customerName,
                poNumber,
                billToAddress,
                shipTo,
                paymentTerms,
                notes,
                template,
              }
            : {
                customerId,
                customerName,
                email: email || undefined,
                dueDate: dueDate || undefined,
                lines: validLines,
                poNumber: poNumber || undefined,
                billToAddress: billToAddress || undefined,
                shipTo: shipTo || undefined,
                paymentTerms: paymentTerms || undefined,
                notes: notes || undefined,
                template,
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

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const classic = template === 'classic';
  const currency = customerCurrency?.value ?? homeCurrencyCode ?? 'USD';
  // Section title bars follow the chosen layout: navy bars on Pro forma, plain grey labels on Classic.
  const bar = (text: string, tone: 'navy' | 'dark' = 'navy') =>
    classic && tone === 'navy' ? (
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{text}</p>
    ) : (
      <p className={`mb-1 px-2 py-1 text-xs font-bold text-white ${classic ? 'bg-[#333]' : 'bg-[#0a3d66]'}`}>{text}</p>
    );

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit invoice' : 'New invoice'} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2" role="radiogroup" aria-label="Invoice layout">
            <span className="text-xs font-medium text-slate-500">Layout</span>
            {(['pro-forma', 'classic'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={template === t}
                onClick={() => setTemplate(t)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  template === t ? 'border-[#0a3d66] bg-[#0a3d66] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {t === 'pro-forma' ? 'Pro forma' : 'Classic'}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">Prints and downloads in this layout. You can switch it any time.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={INVOICE_LOGO} alt="Globlex AI" className="h-12 w-auto" />
            </div>
            <div className="w-full sm:w-auto sm:min-w-[300px]">
              <p className={`mb-2 text-right ${classic ? 'text-3xl font-light tracking-wide text-slate-800' : 'text-3xl font-extrabold text-[#0a3d66]'}`}>
                INVOICE
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="dueDate">Due date</Label>
                  <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="poNumber">PO / SO number</Label>
                  <Input id="poNumber" value={poNumber} maxLength={60} onChange={(e) => setPoNumber(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="terms">Payment terms</Label>
                  <Input id="terms" value={paymentTerms} maxLength={120} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30" />
                </div>
              </div>
              <p className="mt-1 text-right text-xs text-slate-400">
                {isEdit ? `Invoice ${invoice?.DocNumber ?? ''} · ` : 'Number is assigned when you save · '}
                {currency}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              {bar('Bill to:')}
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
              <div className="mt-2">
                <Label htmlFor="billTo">Address</Label>
                <Textarea id="billTo" rows={3} value={billToAddress} maxLength={400} onChange={(e) => setBillToAddress(e.target.value)} placeholder={'Street address\nCity, State ZIP'} />
              </div>
              <div className="mt-2">
                <Label htmlFor="email">Billing email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
              </div>
            </div>
            <div>
              {bar('Ship to (optional):')}
              <Textarea id="shipTo" rows={6} value={shipTo} maxLength={400} onChange={(e) => setShipTo(e.target.value)} placeholder={'Name\nStreet address\nCity, State ZIP'} aria-label="Ship to" />
            </div>
          </div>

          {isForeignCurrency ? (
            <div className="mt-4">
              <CurrencyExchangeRateField
                currencyCode={customerCurrency!.value}
                homeCurrencyCode={homeCurrencyCode}
                exchangeRate={exchangeRate}
                onExchangeRateChange={setExchangeRate}
              />
            </div>
          ) : null}

          <div className="mt-5">
            {bar('Items', 'dark')}
            <LineItemsEditor products={products} lines={lines} onChange={setLines} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-5">
            <div className="sm:col-span-3">
              {bar('Notes / Terms of sale')}
              <Textarea id="notes" rows={5} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="Payment instructions, terms, thank-you note…" aria-label="Notes and terms" />
            </div>
            <div className="sm:col-span-2">
              <div className="flex justify-between border-b border-slate-200 py-1.5 text-sm text-slate-600">
                <span>Subtotal</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
              <div className="flex justify-between py-1.5 text-sm font-bold text-slate-900">
                <span>Amount due</span>
                <span>{formatCurrency(total, currency)}</span>
              </div>
            </div>
          </div>
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
