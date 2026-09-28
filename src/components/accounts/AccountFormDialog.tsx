'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label, Input, Select, Textarea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { ACCOUNT_TYPES, ACCOUNT_SUBTYPES, type AccountType } from '@/lib/quickbooks/accountTypes';
import type { Account } from '@/lib/quickbooks/chartOfAccounts';

interface AccountFormDialogProps {
  open: boolean;
  onClose: () => void;
  account?: Account;
  onSaved: () => void;
}

export function AccountFormDialog({ open, onClose, account, onSaved }: AccountFormDialogProps) {
  const { notify } = useToast();
  const isEdit = Boolean(account);

  const [name, setName] = useState(account?.Name ?? '');
  const [accountType, setAccountType] = useState<AccountType>(
    (account?.AccountType as AccountType) ?? ACCOUNT_TYPES[0],
  );
  const [accountSubType, setAccountSubType] = useState(
    account?.AccountSubType ?? ACCOUNT_SUBTYPES[ACCOUNT_TYPES[0]][0].value,
  );
  // Falls back to an empty list for an existing account whose real
  // AccountType/SubType (set directly in QuickBooks) isn't one of the
  // curated options above — the selects stay disabled in edit mode either way.
  const subTypeOptions = ACCOUNT_SUBTYPES[accountType] ?? [];
  const [acctNum, setAcctNum] = useState(account?.AcctNum ?? '');
  const [description, setDescription] = useState(account?.Description ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(isEdit ? `/api/accounts/${account!.Id}` : '/api/accounts', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isEdit
            ? { syncToken: account!.SyncToken, name, acctNum: acctNum || undefined, description: description || undefined }
            : { name, accountType, accountSubType, acctNum: acctNum || undefined, description: description || undefined },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save account.');
      }
      notify(isEdit ? 'Account updated.' : 'Account added.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit account' : 'Add an account'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="accountType">Account type</Label>
            <Select
              id="accountType"
              value={accountType}
              disabled={isEdit}
              onChange={(e) => {
                const nextType = e.target.value as AccountType;
                setAccountType(nextType);
                setAccountSubType(ACCOUNT_SUBTYPES[nextType][0].value);
              }}
            >
              {ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
            {isEdit ? (
              <p className="mt-1 text-xs text-slate-500">Account type can&apos;t be changed after creation.</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="accountSubType">Category</Label>
            <Select
              id="accountSubType"
              value={accountSubType}
              disabled={isEdit}
              onChange={(e) => setAccountSubType(e.target.value)}
            >
              {subTypeOptions.some((s) => s.value === accountSubType) ? null : (
                <option value={accountSubType}>{accountSubType}</option>
              )}
              {subTypeOptions.map((subType) => (
                <option key={subType.value} value={subType.value}>
                  {subType.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="acctNum">Account number (optional)</Label>
          <Input id="acctNum" value={acctNum} onChange={(e) => setAcctNum(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea id="description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" loading={loading}>
            {isEdit ? 'Save changes' : 'Add account'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
