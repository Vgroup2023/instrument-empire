'use client';

import { Select } from '@/components/ui/Field';
import { Input } from '@/components/ui/Field';
import type { Customer } from '@/lib/quickbooks/customers';
import { useRemoteOptions } from './useRemoteOptions';

export function CustomerSelect({
  customers,
  value,
  onChange,
}: {
  customers: Customer[];
  value: string;
  onChange: (
    customerId: string,
    customerName: string,
    email?: string,
    currencyRef?: { value: string; name?: string },
  ) => void;
}) {
  // Deactivated customers shouldn't be picked for new transactions, but an
  // already-selected one (e.g. editing an older document) must stay visible.
  const { items, capped, query, setQuery } = useRemoteOptions('customers', customers, value);
  const selectable = items.filter((c) => c.Active !== false || c.Id === value);

  return (
    <>
    {capped ? <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers by name…" aria-label="Search customers" className="mb-2" /> : null}
    <Select
      value={value}
      onChange={(e) => {
        const customer = items.find((c) => c.Id === e.target.value);
        onChange(
          e.target.value,
          customer?.DisplayName ?? '',
          customer?.PrimaryEmailAddr?.Address,
          customer?.CurrencyRef,
        );
      }}
      required
    >
      <option value="">Select a customer…</option>
      {selectable.map((customer) => (
        <option key={customer.Id} value={customer.Id}>
          {customer.DisplayName}
        </option>
      ))}
    </Select>
    </>
  );
}
