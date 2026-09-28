import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, updateInvoice, type UpdateInvoiceInput } from '@/lib/quickbooks/invoices';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await getInvoice(id);
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<UpdateInvoiceInput, 'id'>;
    const invoice = await updateInvoice({ id, ...body });
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
