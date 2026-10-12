import { NextRequest, NextResponse } from 'next/server';
import { deleteInvoice, getInvoice, updateInvoice, type UpdateInvoiceInput } from '@/lib/accounting/invoices';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

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
    const body = (await readJson(request)) as unknown as Omit<UpdateInvoiceInput, 'id'>;
    const invoice = await updateInvoice({ id, ...body });
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteInvoice(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
