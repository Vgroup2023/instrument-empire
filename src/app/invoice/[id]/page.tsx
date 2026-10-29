import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { customers } from '@/db/schema';
import { getInvoice } from '@/lib/accounting/invoices';
import { describeError } from '@/lib/errors';
import { InvoiceDocument, type InvoiceParty, type InvoiceStyle } from '@/components/invoices/InvoiceDocument';
import { InvoiceToolbar } from '@/components/invoices/InvoiceToolbar';

export const dynamic = 'force-dynamic';

export default async function InvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ style?: string }>;
}) {
  const { id } = await params;
  const { style: rawStyle } = await searchParams;
  const style: InvoiceStyle = rawStyle === 'classic' ? 'classic' : 'pro-forma';

  let invoice: Awaited<ReturnType<typeof getInvoice>> | null = null;
  let party: InvoiceParty | null = null;
  let error: unknown = null;
  try {
    invoice = await getInvoice(id);
    const [c] = await getDb().select().from(customers).where(eq(customers.id, invoice.CustomerRef.value));
    party = { name: c?.companyName || c?.displayName || invoice.CustomerRef.name || 'Customer', email: c?.email ?? invoice.BillEmail?.Address, phone: c?.phone };
  } catch (err) {
    error = err;
  }

  if (!invoice || !party) {
    return <p className="p-8 text-sm text-slate-600">{describeError(error, "Couldn't load this invoice.")}</p>;
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">
      <style dangerouslySetInnerHTML={{ __html: '@page{size:Letter;margin:0.5in}@media print{body{background:#fff}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' }} />
      <InvoiceToolbar id={id} style={style} fileName={`Invoice-${invoice.DocNumber ?? invoice.Id}`} />
      <div className="mx-auto max-w-[8.5in] bg-white p-10 shadow-card print:max-w-none print:p-0 print:shadow-none">
        <InvoiceDocument invoice={invoice} to={party} style={style} />
      </div>
    </div>
  );
}
