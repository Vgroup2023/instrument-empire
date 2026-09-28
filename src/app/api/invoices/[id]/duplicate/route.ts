import { NextResponse } from 'next/server';
import { duplicateInvoice } from '@/lib/quickbooks/invoices';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await duplicateInvoice(id);
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
