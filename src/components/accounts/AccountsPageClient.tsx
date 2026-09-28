'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { AccountFormDialog } from '@/components/accounts/AccountFormDialog';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency } from '@/lib/format';
import type { Account } from '@/lib/accounting/chartOfAccounts';

export function AccountsPageClient({ initialAccounts }: { initialAccounts: Account[] }) {
  const { notify } = useToast();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | undefined>(undefined);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/accounts', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts);
    }
  }

  async function toggleActive(account: Account) {
    setTogglingId(account.Id);
    try {
      const res = await fetch(`/api/accounts/${account.Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !account.Active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to update account.');
      }
      notify(account.Active ? 'Account deactivated.' : 'Account reactivated.');
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
        title="Chart of accounts"
        description="Every account in your books — bank, income, expense, and everything between."
        actions={
          <Button
            onClick={() => {
              setEditingAccount(undefined);
              setFormOpen(true);
            }}
          >
            + Add account
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {accounts.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No accounts found" description="Add your first account to get started." />
            </div>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Category</Th>
                  <Th>No.</Th>
                  <Th className="text-right">Balance</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </Thead>
              <Tbody>
                {accounts.map((account) => (
                  <Tr key={account.Id}>
                    <Td>
                      <p className="font-medium text-slate-900">{account.Name}</p>
                      {account.Description ? <p className="text-xs text-slate-500">{account.Description}</p> : null}
                    </Td>
                    <Td>{account.AccountType}</Td>
                    <Td className="text-slate-500">{account.AccountSubType ?? '—'}</Td>
                    <Td>{account.AcctNum ?? '—'}</Td>
                    <Td className="text-right">
                      {account.CurrentBalance !== undefined ? formatCurrency(account.CurrentBalance) : '—'}
                    </Td>
                    <Td>
                      <Badge tone={account.Active ? 'success' : 'neutral'}>
                        {account.Active ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingAccount(account);
                            setFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={togglingId === account.Id}
                          onClick={() => toggleActive(account)}
                        >
                          {account.Active ? 'Deactivate' : 'Reactivate'}
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

      <AccountFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        account={editingAccount}
        onSaved={refresh}
      />
    </div>
  );
}
