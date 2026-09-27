import { NextRequest, NextResponse } from 'next/server';
import { createPaymentLink, listPaymentLinks, type CreatePaymentLinkInput } from '@/lib/quickbooks/payments';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const links = await listPaymentLinks();
    return NextResponse.json({ links });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreatePaymentLinkInput;
    if (!body.customerId || !body.amount) {
      return NextResponse.json({ error: 'A customer and amount are required.' }, { status: 400 });
    }
    const link = await createPaymentLink(body);
    return NextResponse.json({ link });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
