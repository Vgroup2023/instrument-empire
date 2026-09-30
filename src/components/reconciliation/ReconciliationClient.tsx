'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Label, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { formatCurrency, formatDate } from '@/lib/format';
import type { GlAccount } from '@/lib/accounting/chartOfAccounts';
import type { ReconciliationResult } from '@/lib/accounting/reconciliation';

export function ReconciliationClient({ accounts }: { accounts: GlAccount[] }) {
  const { notify } = useToast();
  const [accountId, setAccountId] = useState(accounts[0]?.Id ?? '');
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ''));
    reader.onerror = () => notify("Couldn't read that file.", 'error');
    reader.readAsText(file);
  }

  async function handleReconcile() {
    if (!accountId) {
      setError('Choose an account first.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/reconciliation/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, csvText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Failed to reconcile the statement.');
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (accounts.length === 0) {
    return <EmptyState title="No bank or credit card accounts yet" description="Add one in your Chart of Accounts first." />;
  }

  const difference = result ? Math.round((result.statementTotal - result.ledgerTotal) * 100) / 100 : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Upload a statement</CardTitle>
            <CardDescription>A CSV with Date, Description, and Amount columns (header row optional).</CardDescription>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="reconcileAccount">Account</Label>
            <Select id="reconcileAccount" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((account) => (
                <option key={account.Id} value={account.Id}>
                  {account.Name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="statementFile">Statement file</Label>
            <input
              id="statementFile"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </div>
          <div>
            <Label htmlFor="statementText">Or paste the CSV contents</Label>
            <Textarea
              id="statementText"
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'Date,Description,Amount\n2026-09-01,ACME CORP PAYMENT,1200.00\n2026-09-03,OFFICE SUPPLY CO,-85.42'}
              className="font-mono text-xs"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end">
            <Button onClick={handleReconcile} loading={loading} disabled={!csvText.trim()}>
              Reconcile
            </Button>
          </div>
        </CardBody>
      </Card>

      {result ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Matched" value={String(result.matched.length)} />
            <StatCard label="Unmatched on statement" value={String(result.unmatchedStatementLines.length)} />
            <StatCard label="Unmatched in your books" value={String(result.unmatchedLedgerTransactions.length)} />
            <StatCard
              label="Difference"
              value={formatCurrency(difference)}
              hint={difference === 0 ? 'Statement and ledger agree' : 'Statement total minus ledger total'}
            />
          </div>

          {result.unmatchedStatementLines.length > 0 ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>On the statement, not found in your books</CardTitle>
                  <CardDescription>These may need a matching invoice payment, bill payment, expense, or transfer recorded.</CardDescription>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th className="text-right">Amount</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {result.unmatchedStatementLines.map((line, i) => (
                      <Tr key={i}>
                        <Td>{formatDate(line.date)}</Td>
                        <Td>{line.description}</Td>
                        <Td className="text-right">{formatCurrency(line.amount)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          ) : null}

          {result.unmatchedLedgerTransactions.length > 0 ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>In your books, not found on the statement</CardTitle>
                  <CardDescription>Recorded here but not yet cleared — could be pending, or worth double-checking.</CardDescription>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th className="text-right">Amount</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {result.unmatchedLedgerTransactions.map((txn) => (
                      <Tr key={txn.id}>
                        <Td>{formatDate(txn.date)}</Td>
                        <Td>{txn.description}</Td>
                        <Td className="text-right">{formatCurrency(txn.amount)}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Matched ({result.matched.length})</CardTitle>
                <CardDescription>Statement line paired with the closest-dated ledger entry of the same amount.</CardDescription>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {result.matched.length === 0 ? (
                <div className="p-6">
                  <EmptyState title="Nothing matched" description="No statement lines matched a recorded transaction." />
                </div>
              ) : (
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Statement date</Th>
                      <Th>Statement description</Th>
                      <Th className="text-right">Amount</Th>
                      <Th>Matched to</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {result.matched.map((pair, i) => (
                      <Tr key={i}>
                        <Td>{formatDate(pair.statement.date)}</Td>
                        <Td>{pair.statement.description}</Td>
                        <Td className="text-right">{formatCurrency(pair.statement.amount)}</Td>
                        <Td className="text-slate-500">
                          {pair.ledger.description} ({formatDate(pair.ledger.date)})
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
