import { NextResponse } from 'next/server';
import { listIncomeAccounts } from '@/lib/quickbooks/items';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const accounts = await listIncomeAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
