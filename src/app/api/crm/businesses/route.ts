import { NextResponse } from 'next/server';
import { businessFinance } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What each business has billed, collected and has overdue. */
export async function GET() {
  try {
    return NextResponse.json({ finance: await businessFinance() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
