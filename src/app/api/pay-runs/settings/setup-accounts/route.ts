import { NextResponse } from 'next/server';
import { setupPayrollAccounts } from '@/lib/payroll/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json({ settings: await setupPayrollAccounts() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
