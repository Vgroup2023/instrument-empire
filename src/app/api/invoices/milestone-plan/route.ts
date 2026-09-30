import { NextRequest, NextResponse } from 'next/server';
import { createMilestoneInvoicePlan, type CreateMilestonePlanInput } from '@/lib/accounting/invoices';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateMilestonePlanInput;
    const invoices = await createMilestoneInvoicePlan(body);
    return NextResponse.json({ invoices });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
