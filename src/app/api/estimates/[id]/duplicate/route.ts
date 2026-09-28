import { NextResponse } from 'next/server';
import { duplicateEstimate } from '@/lib/quickbooks/estimates';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const estimate = await duplicateEstimate(params.id);
    return NextResponse.json({ estimate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
