import { NextRequest, NextResponse } from 'next/server';
import { sendPaymentLink } from '@/lib/quickbooks/payments';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const link = await sendPaymentLink(params.id, body.email);
    return NextResponse.json({ link });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
