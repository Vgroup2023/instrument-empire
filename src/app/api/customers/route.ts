import { NextRequest, NextResponse } from 'next/server';
import { createCustomer, listCustomers, listCustomersPage, type CreateCustomerInput } from '@/lib/accounting/customers';
import { parsePaging } from '@/lib/paging';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams);
    if (paging) {
      const { items, total } = await listCustomersPage(paging.limit, paging.offset);
      return NextResponse.json({ customers: items, total });
    }
    const customers = await listCustomers();
    return NextResponse.json({ customers });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateCustomerInput;
    if (!body.displayName) {
      return NextResponse.json({ error: 'A customer name is required.' }, { status: 400 });
    }
    const customer = await createCustomer(body);
    return NextResponse.json({ customer });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
