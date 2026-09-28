import { NextRequest, NextResponse } from 'next/server';
import { createBill, listBills, type CreateBillInput } from '@/lib/accounting/bills';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const bills = await listBills();
    return NextResponse.json({ bills });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBillInput;
    if (!body.vendorId || !body.lines?.length) {
      return NextResponse.json({ error: 'A vendor and at least one expense line are required.' }, { status: 400 });
    }
    const bill = await createBill(body);
    return NextResponse.json({ bill });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
