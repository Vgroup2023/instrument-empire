import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { getOverview, listExpenseOptions, listRules } from '@/lib/bookkeeping/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [overview, rules, options] = await Promise.all([getOverview(), listRules(), listExpenseOptions()]);
    return NextResponse.json({ overview, rules, options });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
