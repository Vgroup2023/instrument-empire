import { NextRequest, NextResponse } from 'next/server';
import { createInvoice, listInvoices, listInvoicesPage, type CreateInvoiceInput } from '@/lib/accounting/invoices';
import { parsePaging } from '@/lib/paging';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams);
    if (paging) {
      const { items, total } = await listInvoicesPage(paging.limit, paging.offset);
      return NextResponse.json({ invoices: items, total });
    }
    const invoices = await listInvoices();
    return NextResponse.json({ invoices });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateInvoiceInput;
    if (!body.customerId || !body.lines?.length) {
      return NextResponse.json({ error: 'A customer and at least one line item are required.' }, { status: 400 });
    }
    const invoice = await createInvoice(body);
    return NextResponse.json({ invoice });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
