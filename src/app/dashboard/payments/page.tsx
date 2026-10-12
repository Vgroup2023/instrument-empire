import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { listCustomers } from '@/lib/accounting/customers';
import { listOverdueInvoices } from '@/lib/accounting/invoices';
import { listPaymentLinks } from '@/lib/quickbooks/payments';
import { providers } from '@/lib/config';
import { PaymentsPageClient } from '@/components/payments/PaymentsPageClient';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  let data: Awaited<ReturnType<typeof loadPaymentsData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadPaymentsData();
  } catch (err) {
    loadError = err;
  }

  if (!data) {
    return (
      <div>
        <PageHeader
          title="Payment links & reminders"
          description="Get paid faster — send a payment link, or nudge customers with overdue balances."
        />
        <EmptyState
          title="Couldn't load payments"
          description={describeError(loadError, 'Please try again.')}
        />
      </div>
    );
  }

  return (
    <PaymentsPageClient
      customers={data.customers}
      initialLinks={data.links}
      overdueInvoices={data.overdueInvoices}
      overdueTotal={data.overdueTotal}
      isDemoPayments={providers.payments === 'mock'}
    />
  );
}

const OVERDUE_LIMIT = 200;

async function loadPaymentsData() {
  const [customers, overdue, links] = await Promise.all([listCustomers(), listOverdueInvoices(OVERDUE_LIMIT), listPaymentLinks()]);
  return { customers, overdueInvoices: overdue.items, overdueTotal: overdue.total, links };
}
