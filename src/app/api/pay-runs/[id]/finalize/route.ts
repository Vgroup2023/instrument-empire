import { NextRequest, NextResponse } from 'next/server';
import { finalizeRun } from '@/lib/payroll/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ run: await finalizeRun((await params).id) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
