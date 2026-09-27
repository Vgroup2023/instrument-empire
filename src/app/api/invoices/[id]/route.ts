import { NextRequest, NextResponse } from 'next/server';
import { getInvoice, updateInvoice, type UpdateInvoiceInput } from '@/lib/quickbooks/invoices';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoice = await getInvoice(params.id);
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as Omit<UpdateInvoiceInput, 'id'>;
    const invoice = await updateInvoice({ id: params.id, ...body });
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
