import { NextRequest, NextResponse } from 'next/server';
import { getCustomer, updateCustomer, type UpdateCustomerInput } from '@/lib/accounting/customers';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const customer = await getCustomer(id);
    return NextResponse.json({ customer });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await readJson(request)) as unknown as Omit<UpdateCustomerInput, 'id'>;
    const customer = await updateCustomer({ id, ...body });
    return NextResponse.json({ customer });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
