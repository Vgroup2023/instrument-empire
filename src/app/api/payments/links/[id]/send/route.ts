import { NextRequest, NextResponse } from 'next/server';
import { sendPaymentLink } from '@/lib/quickbooks/payments';
import { apiErrorResponse } from '@/lib/apiError';
import { readOptionalJson } from '@/lib/http';
import { optEmail } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readOptionalJson(request);
    const link = await sendPaymentLink(id, optEmail(body.email));
    return NextResponse.json({ link });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
