import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listVendors } from '@/lib/quickbooks/vendors';
import { VendorsPageClient } from '@/components/vendors/VendorsPageClient';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader title="Vendors" description="Everyone you owe money to, all in one place." />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to manage vendors" />
      </div>
    );
  }

  const vendors = await listVendors();
  return <VendorsPageClient initialVendors={vendors} />;
}
