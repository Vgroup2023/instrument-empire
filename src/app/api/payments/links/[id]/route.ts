import { NextRequest, NextResponse } from 'next/server';
import { updatePaymentLink, type UpdatePaymentLinkInput } from '@/lib/quickbooks/payments';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await readJson(request)) as unknown as UpdatePaymentLinkInput;
    const link = await updatePaymentLink(id, body);
    return NextResponse.json({ link });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
