import { NextRequest, NextResponse } from 'next/server';
import { suggestExpenseAccountsForVendor } from '@/lib/accounting/expenses';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const vendorId = request.nextUrl.searchParams.get('vendorId');
    if (!vendorId) return NextResponse.json({ suggestions: [] });
    const suggestions = await suggestExpenseAccountsForVendor(vendorId);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
