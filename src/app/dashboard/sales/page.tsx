import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { BarList } from '@/components/charts/BarList';
import { isQboConnected } from '@/lib/quickbooks/client';
import { getSalesByCustomer, getSalesByProduct, type SalesBreakdownRow } from '@/lib/quickbooks/reports';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const connected = await isQboConnected();

  return (
    <div>
      <PageHeader
        title="Sales breakdown"
        description="What's driving revenue this year, by customer and by product or service."
      />
      <ConnectBanner />
      {connected ? (
        <SalesBody />
      ) : (
        <EmptyState
          title="No sales data yet"
          description="Connect QuickBooks above to see sales broken down by customer and product."
        />
      )}
    </div>
  );
}

async function SalesBody() {
  let byCustomer: SalesBreakdownRow[] = [];
  let byProduct: SalesBreakdownRow[] = [];
  let error: string | null = null;

  try {
    [byCustomer, byProduct] = await Promise.all([getSalesByCustomer('this-year'), getSalesByProduct('this-year')]);
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load sales reports.';
  }

  if (error) {
    return <EmptyState title="Couldn't load sales reports" description={error} />;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Top customers by revenue</CardTitle>
            <CardDescription>Year to date</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <BarList items={byCustomer.slice(0, 10).map((r) => ({ label: r.name, value: r.amount }))} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Top products & services by revenue</CardTitle>
            <CardDescription>Year to date</CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <BarList
            tone="amber"
            items={byProduct.slice(0, 10).map((r) => ({ label: r.name, value: r.amount }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
