import { NextResponse } from 'next/server';
import { listCompanyCurrencies, getHomeCurrency } from '@/lib/quickbooks/currencies';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [currencies, homeCurrency] = await Promise.all([listCompanyCurrencies(), getHomeCurrency()]);
    return NextResponse.json({ currencies, homeCurrency });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
