'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { VendorFormDialog } from '@/components/vendors/VendorFormDialog';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, initials } from '@/lib/format';
import type { Vendor } from '@/lib/accounting/vendors';
import type { Currency } from '@/lib/quickbooks/currencies';

export function VendorsPageClient({
  initialVendors,
  currencies,
  homeCurrency,
}: {
  initialVendors: Vendor[];
  currencies: Currency[];
  homeCurrency: Currency | null;
}) {
  const { notify } = useToast();
  const [vendors, setVendors] = useState(initialVendors);
  const [formOpen, setFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | undefined>(undefined);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/vendors', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setVendors(data.vendors);
    }
  }

  async function toggleActive(vendor: Vendor) {
    setTogglingId(vendor.Id);
    try {
      const res = await fetch(`/api/vendors/${vendor.Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncToken: vendor.SyncToken, active: !vendor.Active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to update vendor.');
      }
      notify(vendor.Active ? 'Vendor deactivated.' : 'Vendor reactivated.');
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Everyone you owe money to, all in one place."
        actions={
          <Button
            onClick={() => {
              setEditingVendor(undefined);
              setFormOpen(true);
            }}
          >
            + Add vendor
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {vendors.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No vendors yet" description="Add your first vendor to start entering bills." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Vendor</Th>
                  <Th>Email</Th>
                  <Th>Phone</Th>
                  <Th className="text-right">Balance owed</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {vendors.map((vendor) => {
                  const isForeign = homeCurrency && vendor.CurrencyRef && vendor.CurrencyRef.value !== homeCurrency.code;
                  return (
                    <Tr key={vendor.Id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                            {initials(vendor.DisplayName)}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-slate-900">{vendor.DisplayName}</p>
                              {isForeign ? <Badge tone="brand">{vendor.CurrencyRef!.value}</Badge> : null}
                            </div>
                            {vendor.CompanyName ? <p className="text-xs text-slate-500">{vendor.CompanyName}</p> : null}
                          </div>
                        </div>
                      </Td>
                      <Td>{vendor.PrimaryEmailAddr?.Address ?? '—'}</Td>
                      <Td>{vendor.PrimaryPhone?.FreeFormNumber ?? '—'}</Td>
                      <Td className="text-right">
                        {formatCurrency(vendor.Balance ?? 0, vendor.CurrencyRef?.value ?? homeCurrency?.code)}
                      </Td>
                      <Td>
                        <Badge tone={vendor.Active ? 'success' : 'neutral'}>{vendor.Active ? 'Active' : 'Inactive'}</Badge>
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingVendor(vendor);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={togglingId === vendor.Id}
                            onClick={() => toggleActive(vendor)}
                          >
                            {vendor.Active ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <VendorFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        vendor={editingVendor}
        currencies={currencies}
        homeCurrency={homeCurrency}
        onSaved={refresh}
      />
    </div>
  );
}
