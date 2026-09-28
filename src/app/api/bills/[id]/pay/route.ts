import { NextRequest, NextResponse } from 'next/server';
import { payBill } from '@/lib/accounting/bills';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (!body.bankAccountId || !body.amount) {
      return NextResponse.json({ error: 'A bank account and amount are required to pay a bill.' }, { status: 400 });
    }
    const bill = await payBill({
      billId: id,
      amount: Number(body.amount),
      bankAccountId: body.bankAccountId,
    });
    return NextResponse.json({ bill });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
