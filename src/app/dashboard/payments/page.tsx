import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { listCustomers } from '@/lib/accounting/customers';
import { listInvoices } from '@/lib/accounting/invoices';
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
          description={loadError instanceof Error ? loadError.message : 'Please try again.'}
        />
      </div>
    );
  }

  return (
    <PaymentsPageClient
      customers={data.customers}
      initialLinks={data.links}
      overdueInvoices={data.overdueInvoices}
      isDemoPayments={providers.payments === 'mock'}
    />
  );
}

async function loadPaymentsData() {
  const [customers, invoices, links] = await Promise.all([listCustomers(), listInvoices(), listPaymentLinks()]);
  const today = new Date();
  const overdueInvoices = invoices.filter(
    (inv) => inv.Balance > 0 && inv.DueDate && new Date(inv.DueDate) < today,
  );
  return { customers, overdueInvoices, links };
}
