'use client';

import { Input, Select } from '@/components/ui/Field';
import { useRemoteOptions } from '@/components/documents/useRemoteOptions';
import type { Vendor } from '@/lib/quickbooks/vendors';

export function VendorSelect({
  vendors,
  value,
  onChange,
  required = true,
}: {
  vendors: Vendor[];
  value: string;
  onChange: (
    vendorId: string,
    vendorName: string,
    currencyRef?: { value: string; name?: string },
  ) => void;
  required?: boolean;
}) {
  // Deactivated vendors shouldn't be picked for new transactions, but an
  // already-selected one (e.g. editing an older document) must stay visible.
  const { items, capped, query, setQuery } = useRemoteOptions('vendors', vendors, value);
  const selectable = items.filter((v) => v.Active !== false || v.Id === value);

  return (
    <>
    {capped ? <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors by name…" aria-label="Search vendors" className="mb-2" /> : null}
    <Select
      value={value}
      onChange={(e) => {
        const vendor = items.find((v) => v.Id === e.target.value);
        onChange(e.target.value, vendor?.DisplayName ?? '', vendor?.CurrencyRef);
      }}
      required={required}
    >
      <option value="">{required ? 'Select a vendor…' : 'No vendor (optional)'}</option>
      {selectable.map((vendor) => (
        <option key={vendor.Id} value={vendor.Id}>
          {vendor.DisplayName}
        </option>
      ))}
    </Select>
    </>
  );
}
