import { NextRequest, NextResponse } from 'next/server';
import { createBill, listBills, listBillsByStatus, parseBillStatus, billCounts, type CreateBillInput } from '@/lib/accounting/bills';
import { parsePaging } from '@/lib/paging';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams);
    if (paging) {
      const status = parseBillStatus(request.nextUrl.searchParams.get('status'));
      const [{ items, total }, counts] = await Promise.all([listBillsByStatus(status, paging.limit, paging.offset), billCounts()]);
      return NextResponse.json({ bills: items, total, counts });
    }
    const bills = await listBills();
    return NextResponse.json({ bills });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateBillInput;
    if (!body.vendorId || !body.lines?.length) {
      return NextResponse.json({ error: 'A vendor and at least one expense line are required.' }, { status: 400 });
    }
    const bill = await createBill(body);
    return NextResponse.json({ bill });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
