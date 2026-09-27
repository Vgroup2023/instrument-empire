import { NextRequest, NextResponse } from 'next/server';
import { sendEstimate } from '@/lib/quickbooks/estimates';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const estimate = await sendEstimate(params.id, body.email);
    return NextResponse.json({ estimate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
