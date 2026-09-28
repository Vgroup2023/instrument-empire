import { NextRequest, NextResponse } from 'next/server';
import {
  listInvoicePayments,
  recordInvoicePayment,
  type RecordInvoicePaymentInput,
} from '@/lib/accounting/invoices';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payments = await listInvoicePayments(id);
    return NextResponse.json({ payments });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<RecordInvoicePaymentInput, 'invoiceId'>;
    if (!body.amount || !body.depositAccountId) {
      return NextResponse.json({ error: 'An amount and a deposit account are required.' }, { status: 400 });
    }
    const payment = await recordInvoicePayment({ invoiceId: id, ...body });
    return NextResponse.json({ payment });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
