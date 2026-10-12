import { NextRequest, NextResponse } from 'next/server';
import { approveBill, unapproveBill } from '@/lib/accounting/bills';
import { apiErrorResponse } from '@/lib/apiError';
import { readOptionalJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await readOptionalJson(request)) as { scheduledPaymentDate?: string };
    const bill = await approveBill({ id, scheduledPaymentDate: body.scheduledPaymentDate });
    return NextResponse.json({ bill });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bill = await unapproveBill(id);
    return NextResponse.json({ bill });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
