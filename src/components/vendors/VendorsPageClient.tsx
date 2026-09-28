'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Modal } from '@/components/ui/Modal';
import { Label, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, initials } from '@/lib/format';
import type { Vendor } from '@/lib/quickbooks/vendors';

export function VendorsPageClient({ initialVendors }: { initialVendors: Vendor[] }) {
  const { notify } = useToast();
  const [vendors, setVendors] = useState(initialVendors);
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/vendors', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setVendors(data.vendors);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, companyName: companyName || undefined, email: email || undefined, phone: phone || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to add vendor.');
      }
      notify('Vendor added.');
      setDisplayName('');
      setCompanyName('');
      setEmail('');
      setPhone('');
      setOpen(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Vendors"
        description="Everyone you owe money to, all in one place."
        actions={<Button onClick={() => setOpen(true)}>+ Add vendor</Button>}
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
                </Tr>
              </Thead>
              <Tbody>
                {vendors.map((vendor) => (
                  <Tr key={vendor.Id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                          {initials(vendor.DisplayName)}
                        </span>
                        <div>
                          <p className="font-medium text-slate-900">{vendor.DisplayName}</p>
                          {vendor.CompanyName ? <p className="text-xs text-slate-500">{vendor.CompanyName}</p> : null}
                        </div>
                      </div>
                    </Td>
                    <Td>{vendor.PrimaryEmailAddr?.Address ?? '—'}</Td>
                    <Td>{vendor.PrimaryPhone?.FreeFormNumber ?? '—'}</Td>
                    <Td className="text-right">{formatCurrency(vendor.Balance ?? 0)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a vendor">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="companyName">Company (optional)</Label>
            <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Add vendor
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
