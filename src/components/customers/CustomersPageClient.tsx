'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, initials } from '@/lib/format';
import type { Customer } from '@/lib/quickbooks/customers';
import type { Currency } from '@/lib/quickbooks/currencies';

export function CustomersPageClient({
  initialCustomers,
  currencies,
  homeCurrency,
}: {
  initialCustomers: Customer[];
  currencies: Currency[];
  homeCurrency: Currency | null;
}) {
  const { notify } = useToast();
  const [customers, setCustomers] = useState(initialCustomers);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>(undefined);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/customers', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setCustomers(data.customers);
    }
  }

  async function toggleActive(customer: Customer) {
    setTogglingId(customer.Id);
    try {
      const res = await fetch(`/api/customers/${customer.Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncToken: customer.SyncToken, active: !customer.Active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to update customer.');
      }
      notify(customer.Active ? 'Customer deactivated.' : 'Customer reactivated.');
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
        title="Customers"
        description="Everyone you bill, all in one place."
        actions={
          <Button
            onClick={() => {
              setEditingCustomer(undefined);
              setFormOpen(true);
            }}
          >
            + Add customer
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {customers.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No customers yet" description="Add your first customer to start invoicing." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Customer</Th>
                  <Th>Email</Th>
                  <Th>Phone</Th>
                  <Th className="text-right">Balance</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {customers.map((customer) => {
                  const isForeign = homeCurrency && customer.CurrencyRef && customer.CurrencyRef.value !== homeCurrency.code;
                  return (
                    <Tr key={customer.Id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                            {initials(customer.DisplayName)}
                          </span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-slate-900">{customer.DisplayName}</p>
                              {isForeign ? <Badge tone="brand">{customer.CurrencyRef!.value}</Badge> : null}
                            </div>
                            {customer.CompanyName ? <p className="text-xs text-slate-500">{customer.CompanyName}</p> : null}
                          </div>
                        </div>
                      </Td>
                      <Td>{customer.PrimaryEmailAddr?.Address ?? '—'}</Td>
                      <Td>{customer.PrimaryPhone?.FreeFormNumber ?? '—'}</Td>
                      <Td className="text-right">
                        {formatCurrency(customer.Balance ?? 0, customer.CurrencyRef?.value ?? homeCurrency?.code)}
                      </Td>
                      <Td>
                        <Badge tone={customer.Active ? 'success' : 'neutral'}>
                          {customer.Active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingCustomer(customer);
                              setFormOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={togglingId === customer.Id}
                            onClick={() => toggleActive(customer)}
                          >
                            {customer.Active ? 'Deactivate' : 'Reactivate'}
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

      <CustomerFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customer={editingCustomer}
        currencies={currencies}
        homeCurrency={homeCurrency}
        onSaved={refresh}
      />
    </div>
  );
}
