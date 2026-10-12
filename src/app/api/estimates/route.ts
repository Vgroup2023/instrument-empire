import { NextRequest, NextResponse } from 'next/server';
import { createEstimate, listEstimates, listEstimatesPage, type CreateEstimateInput } from '@/lib/accounting/estimates';
import { parsePaging } from '@/lib/paging';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams);
    if (paging) {
      const { items, total } = await listEstimatesPage(paging.limit, paging.offset);
      return NextResponse.json({ estimates: items, total });
    }
    const estimates = await listEstimates();
    return NextResponse.json({ estimates });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateEstimateInput;
    if (!body.customerId || !body.lines?.length) {
      return NextResponse.json({ error: 'A customer and at least one line item are required.' }, { status: 400 });
    }
    const estimate = await createEstimate(body);
    return NextResponse.json({ estimate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
