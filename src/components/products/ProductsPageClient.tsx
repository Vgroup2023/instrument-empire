'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ProductFormDialog } from '@/components/products/ProductFormDialog';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Product, IncomeAccount } from '@/lib/accounting/products';

export function ProductsPageClient({
  initialProducts,
  incomeAccounts,
}: {
  initialProducts: Product[];
  incomeAccounts: IncomeAccount[];
}) {
  const { notify } = useToast();
  const [products, setProducts] = useState(initialProducts);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>(undefined);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/products', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
    }
  }

  async function toggleActive(product: Product) {
    setTogglingId(product.Id);
    try {
      const res = await fetch(`/api/products/${product.Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncToken: product.SyncToken, active: !product.Active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to update product/service.');
      }
      notify(product.Active ? 'Product/service deactivated.' : 'Product/service reactivated.');
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
        title="Products & services"
        description="What you sell — used as line items on invoices and estimates."
        actions={
          <Button
            onClick={() => {
              setEditingProduct(undefined);
              setFormOpen(true);
            }}
          >
            + Add product/service
          </Button>
        }
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
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
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
                    <Td>
                      <Badge tone={product.Active ? 'success' : 'neutral'}>
                        {product.Active ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingProduct(product);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={togglingId === product.Id}
                          onClick={() => toggleActive(product)}
                        >
                          {product.Active ? 'Deactivate' : 'Reactivate'}
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <ProductFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        product={editingProduct}
        incomeAccounts={incomeAccounts}
        onSaved={refresh}
      />
    </div>
  );
}
