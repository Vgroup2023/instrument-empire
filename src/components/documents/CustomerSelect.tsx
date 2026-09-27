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
  onChange: (customerId: string, customerName: string, email?: string) => void;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => {
        const customer = customers.find((c) => c.Id === e.target.value);
        onChange(e.target.value, customer?.DisplayName ?? '', customer?.PrimaryEmailAddr?.Address);
      }}
      required
    >
      <option value="">Select a customer…</option>
      {customers.map((customer) => (
        <option key={customer.Id} value={customer.Id}>
          {customer.DisplayName}
        </option>
      ))}
    </Select>
  );
}
