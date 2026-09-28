import { ConnectBanner } from '@/components/ConnectBanner';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { isQboConnected } from '@/lib/quickbooks/client';
import { listCustomers } from '@/lib/quickbooks/customers';
import { listInvoices } from '@/lib/quickbooks/invoices';
import { listPaymentLinks } from '@/lib/quickbooks/payments';
import { providers } from '@/lib/config';
import { PaymentsPageClient } from '@/components/payments/PaymentsPageClient';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const connected = await isQboConnected();

  if (!connected) {
    return (
      <div>
        <PageHeader
          title="Payment links & reminders"
          description="Get paid faster — send a payment link, or nudge customers with overdue balances."
        />
        <ConnectBanner />
        <EmptyState title="Connect QuickBooks to see customers and overdue invoices" />
      </div>
    );
  }

  const [customers, invoices, links] = await Promise.all([listCustomers(), listInvoices(), listPaymentLinks()]);
  const today = new Date();
  const overdueInvoices = invoices.filter(
    (inv) => inv.Balance > 0 && inv.DueDate && new Date(inv.DueDate) < today,
  );

  return (
    <PaymentsPageClient
      customers={customers}
      initialLinks={links}
      overdueInvoices={overdueInvoices}
      isDemoPayments={providers.payments === 'mock'}
    />
  );
}
