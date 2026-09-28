import { NextRequest, NextResponse } from 'next/server';
import { updatePaymentLink, type UpdatePaymentLinkInput } from '@/lib/quickbooks/payments';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdatePaymentLinkInput;
    const link = await updatePaymentLink(id, body);
    return NextResponse.json({ link });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
