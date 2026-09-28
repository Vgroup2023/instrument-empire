import { NextRequest, NextResponse } from 'next/server';
import { createEstimate, listEstimates, type CreateEstimateInput } from '@/lib/accounting/estimates';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const estimates = await listEstimates();
    return NextResponse.json({ estimates });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateEstimateInput;
    if (!body.customerId || !body.lines?.length) {
      return NextResponse.json({ error: 'A customer and at least one line item are required.' }, { status: 400 });
    }
    const estimate = await createEstimate(body);
    return NextResponse.json({ estimate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
