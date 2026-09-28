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
  searchParams: Promise<{ qbo_connected?: string; qbo_error?: string }>;
}) {
  const [tokens, params] = await Promise.all([getQboTokens(), searchParams]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & connection"
        description="This app runs on its own database — nothing here is required for daily use. QuickBooks is an optional, separate connection for the one feature below that still uses it."
      />

      {params.qbo_connected ? (
        <div className="rounded-xl2 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          QuickBooks connected successfully.
        </div>
      ) : null}
      {params.qbo_error ? (
        <div className="rounded-xl2 border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {ERROR_MESSAGES[params.qbo_error] ?? 'Something went wrong connecting to QuickBooks.'}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>QuickBooks Online</CardTitle>
            <CardDescription>
              Fully optional. Every feature in this app — Chart of accounts, Invoices, Bills, Expenses,
              Payroll, Payment links, Insights, and everything else — already runs on this app&apos;s own
              database, connected or not. Nothing here changes what you can do; connecting or disconnecting
              is safe at any time.
            </CardDescription>
          </div>
          {tokens ? <Badge tone="success">Connected</Badge> : <Badge tone="neutral">Not connected</Badge>}
        </CardHeader>
        <CardBody>
          {tokens ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Connected to <strong>{tokens.companyName}</strong>.
              </p>
              <DisconnectButton />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                There&apos;s no need to connect this for day-to-day use — it exists only as a foundation for
                a future live QuickBooks Capital or industry-benchmarking integration (see below), which
                aren&apos;t built yet either. If you&apos;d still like to connect a company, you&apos;ll be
                redirected to Intuit to sign in and grant access.
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
            <CardTitle>Payment links & Payroll</CardTitle>
            <CardDescription>
              Fully real and stored in this app&apos;s own database either way — sending a payment link or
              running payroll for real money movement additionally requires QuickBooks Payments/Payroll
              product access, which is separate from the connection above and not required for the rest of
              these features to work.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProviderRow name="Payment links" mode={providers.payments} mockLabel="Local database" />
          <ProviderRow name="Payroll" mode={providers.payroll} mockLabel="Local database" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Illustrative only</CardTitle>
            <CardDescription>
              These two require separate Intuit product access that this app doesn&apos;t have, and the
              live API calls haven&apos;t been implemented yet — connecting QuickBooks above doesn&apos;t
              change that. They show clearly-labeled illustrative data instead of fabricating real figures.
              See the README for what wiring up real access would take.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ProviderRow name="QuickBooks Capital" mode={providers.capital} />
          <ProviderRow name="Industry benchmarking" mode={providers.benchmark} />
        </CardBody>
      </Card>
    </div>
  );
}

function ProviderRow({
  name,
  mode,
  mockLabel = 'Demo data',
}: {
  name: string;
  mode: 'mock' | 'live';
  mockLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
      <span className="text-sm font-medium text-slate-700">{name}</span>
      <Badge tone={mode === 'live' ? 'success' : 'neutral'}>{mode === 'live' ? 'Live' : mockLabel}</Badge>
    </div>
  );
}
