import { NextRequest, NextResponse } from 'next/server';
import { createMilestoneInvoicePlan, type CreateMilestonePlanInput } from '@/lib/accounting/invoices';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateMilestonePlanInput;
    const invoices = await createMilestoneInvoicePlan(body);
    return NextResponse.json({ invoices });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
