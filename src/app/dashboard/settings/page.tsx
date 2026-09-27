import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getQboTokens } from '@/lib/session';
import { providers } from '@/lib/config';
import { DisconnectButton } from '@/components/settings/DisconnectButton';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  missing_parameters: 'QuickBooks did not return the expected connection details. Please try again.',
  state_mismatch: "The connection request couldn't be verified. Please try connecting again.",
  token_exchange_failed: 'QuickBooks rejected the connection request. Please try again.',
  access_denied: 'The QuickBooks connection was cancelled.',
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { qbo_connected?: string; qbo_error?: string };
}) {
  const tokens = await getQboTokens();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings & connection" description="Manage your QuickBooks Online connection." />

      {searchParams.qbo_connected ? (
        <div className="rounded-xl2 border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          QuickBooks connected successfully.
        </div>
      ) : null}
      {searchParams.qbo_error ? (
        <div className="rounded-xl2 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {ERROR_MESSAGES[searchParams.qbo_error] ?? 'Something went wrong connecting to QuickBooks.'}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>QuickBooks Online</CardTitle>
            <CardDescription>Business banking, accounting, invoicing, and reporting.</CardDescription>
          </div>
          {tokens ? <Badge tone="success">Connected</Badge> : <Badge tone="warning">Not connected</Badge>}
        </CardHeader>
        <CardBody>
          {tokens ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Connected to <strong>{tokens.companyName}</strong>.
              </p>
              <DisconnectButton />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Connect your QuickBooks Online company to pull in your real bank feed activity, invoices,
                customers, and reports. You&apos;ll be redirected to Intuit to sign in and grant access.
              </p>
              <a
                href="/api/auth/connect"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Connect QuickBooks
              </a>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Extended product access</CardTitle>
            <CardDescription>
              These features use separate Intuit products beyond standard accounting access. They run on
              realistic demo data until wired up to live credentials — see the README for how.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProviderRow name="Payment links" mode={providers.payments} />
          <ProviderRow name="Payroll" mode={providers.payroll} />
          <ProviderRow name="QuickBooks Capital" mode={providers.capital} />
          <ProviderRow name="Industry benchmarking" mode={providers.benchmark} />
        </CardBody>
      </Card>
    </div>
  );
}

function ProviderRow({ name, mode }: { name: string; mode: 'mock' | 'live' }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-steel-700 px-3 py-2">
      <span className="text-sm font-medium text-slate-200">{name}</span>
      <Badge tone={mode === 'live' ? 'success' : 'neutral'}>{mode === 'live' ? 'Live' : 'Demo data'}</Badge>
    </div>
  );
}
