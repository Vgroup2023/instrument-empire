'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Label, Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Product } from '@/lib/quickbooks/items';

export function ProductsPageClient({ initialProducts }: { initialProducts: Product[] }) {
  const { notify } = useToast();
  const [products, setProducts] = useState(initialProducts);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'Service' | 'NonInventory'>('Service');
  const [unitPrice, setUnitPrice] = useState('0');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/products', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, unitPrice: Number(unitPrice) || 0, description: description || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to add product.');
      }
      notify('Product/service added.');
      setName('');
      setUnitPrice('0');
      setDescription('');
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
        title="Products & services"
        description="What you sell — used as line items on invoices and estimates."
        actions={<Button onClick={() => setOpen(true)}>+ Add product/service</Button>}
      />

      <Card>
        <CardBody className="p-0">
          {products.length === 0 ? (
            <div className="p-6">
              <EmptyState title="Nothing here yet" description="Add a product or service to start building invoices." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th className="text-right">Price</Th>
                </Tr>
              </Thead>
              <Tbody>
                {products.map((product) => (
                  <Tr key={product.Id}>
                    <Td>
                      <p className="font-medium text-slate-900">{product.Name}</p>
                      {product.Description ? <p className="text-xs text-slate-500">{product.Description}</p> : null}
                    </Td>
                    <Td>
                      <Badge tone="neutral">{product.Type}</Badge>
                    </Td>
                    <Td className="text-right">{formatCurrency(product.UnitPrice ?? 0)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a product or service">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="type">Type</Label>
              <Select id="type" value={type} onChange={(e) => setType(e.target.value as 'Service' | 'NonInventory')}>
                <option value="Service">Service</option>
                <option value="NonInventory">Non-inventory product</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="unitPrice">Price</Label>
              <Input id="unitPrice" type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Add
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
