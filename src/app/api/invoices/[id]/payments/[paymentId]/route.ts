import { NextRequest, NextResponse } from 'next/server';
import { deleteInvoicePayment } from '@/lib/accounting/invoices';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  try {
    const { id, paymentId } = await params;
    await deleteInvoicePayment(id, paymentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
