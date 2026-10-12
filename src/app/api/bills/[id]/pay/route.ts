import { NextRequest, NextResponse } from 'next/server';
import { payBill } from '@/lib/accounting/bills';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    // The amount and account are checked in payBill, so a text amount is refused instead of being quietly converted.
    const bill = await payBill({
      billId: id,
      amount: body.amount as number,
      bankAccountId: body.bankAccountId as string,
      paymentDate: body.paymentDate as string | undefined,
    });
    return NextResponse.json({ bill });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
