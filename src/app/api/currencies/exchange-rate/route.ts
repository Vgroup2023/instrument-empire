import { NextRequest, NextResponse } from 'next/server';
import { getExchangeRate } from '@/lib/quickbooks/currencies';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: 'A currency code is required.' }, { status: 400 });
    }
    const rate = await getExchangeRate(code);
    return NextResponse.json({ rate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
