import { NextRequest, NextResponse } from 'next/server';
import { getEstimate, updateEstimate, type UpdateEstimateInput } from '@/lib/quickbooks/estimates';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const estimate = await getEstimate(params.id);
    return NextResponse.json({ estimate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as Omit<UpdateEstimateInput, 'id'>;
    const estimate = await updateEstimate({ id: params.id, ...body });
    return NextResponse.json({ estimate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
