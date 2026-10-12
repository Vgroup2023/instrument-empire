import { NextRequest, NextResponse } from 'next/server';
import { createBill, listBills, listBillsPage, type CreateBillInput } from '@/lib/accounting/bills';
import { parsePaging } from '@/lib/paging';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams);
    if (paging) {
      const { items, total } = await listBillsPage(paging.limit, paging.offset);
      return NextResponse.json({ bills: items, total });
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
