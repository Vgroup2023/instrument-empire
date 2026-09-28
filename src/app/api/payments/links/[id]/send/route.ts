import { NextRequest, NextResponse } from 'next/server';
import { sendPaymentLink } from '@/lib/quickbooks/payments';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const link = await sendPaymentLink(id, body.email);
    return NextResponse.json({ link });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
