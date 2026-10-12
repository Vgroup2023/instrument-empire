import { NextRequest, NextResponse } from 'next/server';
import { sendInvoiceReminder } from '@/lib/accounting/invoices';
import { apiErrorResponse } from '@/lib/apiError';
import { readOptionalJson } from '@/lib/http';
import { optEmail } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readOptionalJson(request);
    const invoice = await sendInvoiceReminder(id, optEmail(body.email));
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
