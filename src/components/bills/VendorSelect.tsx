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
  onChange: (vendorId: string, vendorName: string) => void;
  required?: boolean;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => {
        const vendor = vendors.find((v) => v.Id === e.target.value);
        onChange(e.target.value, vendor?.DisplayName ?? '');
      }}
      required={required}
    >
      <option value="">{required ? 'Select a vendor…' : 'No vendor (optional)'}</option>
      {vendors.map((vendor) => (
        <option key={vendor.Id} value={vendor.Id}>
          {vendor.DisplayName}
        </option>
      ))}
    </Select>
  );
}
