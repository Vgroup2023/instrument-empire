'use client';

import { Input, Select } from '@/components/ui/Field';
import { useRemoteOptions } from './useRemoteOptions';

/** A plain customer drop-down for screens that only keep { id, name } pairs (RFQs, shipments). Searches the server once the list is long. */
export function CustomerNameSelect({
  id,
  customers,
  value,
  onChange,
  emptyLabel,
}: {
  id: string;
  customers: { id: string; name: string }[];
  value: string;
  onChange: (customerId: string) => void;
  emptyLabel: string;
}) {
  const initial = customers.map((c) => ({ Id: c.id, DisplayName: c.name }));
  const { items, capped, query, setQuery } = useRemoteOptions('customers', initial, value);
  return (
    <>
      {capped ? <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers by name…" aria-label="Search customers" className="mb-2" /> : null}
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
        {items.map((c) => (
          <option key={c.Id} value={c.Id}>
            {c.DisplayName}
          </option>
        ))}
      </Select>
    </>
  );
}
