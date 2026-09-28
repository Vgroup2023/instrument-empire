import { NextRequest, NextResponse } from 'next/server';
import { createInvoice, listInvoices, type CreateInvoiceInput } from '@/lib/quickbooks/invoices';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const invoices = await listInvoices();
    return NextResponse.json({ invoices });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateInvoiceInput;
    if (!body.customerId || !body.lines?.length) {
      return NextResponse.json({ error: 'A customer and at least one line item are required.' }, { status: 400 });
    }
    const invoice = await createInvoice(body);
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
