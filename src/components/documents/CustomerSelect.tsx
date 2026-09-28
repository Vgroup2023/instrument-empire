'use client';

import { Select } from '@/components/ui/Field';
import type { Customer } from '@/lib/quickbooks/customers';

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
  const selectable = customers.filter((c) => c.Active !== false || c.Id === value);

  return (
    <Select
      value={value}
      onChange={(e) => {
        const customer = customers.find((c) => c.Id === e.target.value);
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
  );
}
