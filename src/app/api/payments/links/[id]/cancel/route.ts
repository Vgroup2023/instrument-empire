import { NextRequest, NextResponse } from 'next/server';
import { cancelPaymentLink } from '@/lib/quickbooks/payments';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const link = await cancelPaymentLink(id);
    return NextResponse.json({ link });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
