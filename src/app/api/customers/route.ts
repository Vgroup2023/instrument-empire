import { NextRequest, NextResponse } from 'next/server';
import { createCustomer, listCustomers, type CreateCustomerInput } from '@/lib/accounting/customers';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const customers = await listCustomers();
    return NextResponse.json({ customers });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateCustomerInput;
    if (!body.displayName) {
      return NextResponse.json({ error: 'A customer name is required.' }, { status: 400 });
    }
    const customer = await createCustomer(body);
    return NextResponse.json({ customer });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
