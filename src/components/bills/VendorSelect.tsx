'use client';

import { Select } from '@/components/ui/Field';
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
  const selectable = vendors.filter((v) => v.Active !== false || v.Id === value);

  return (
    <Select
      value={value}
      onChange={(e) => {
        const vendor = vendors.find((v) => v.Id === e.target.value);
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
  );
}
