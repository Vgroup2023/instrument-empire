import { NextRequest, NextResponse } from 'next/server';
import { payBill } from '@/lib/quickbooks/billPayments';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (!body.vendorId || !body.bankAccountId || !body.amount) {
      return NextResponse.json(
        { error: 'A vendor, bank account, and amount are required to pay a bill.' },
        { status: 400 },
      );
    }
    const payment = await payBill({
      billId: id,
      vendorId: body.vendorId,
      vendorName: body.vendorName,
      amount: Number(body.amount),
      bankAccountId: body.bankAccountId,
      bankAccountName: body.bankAccountName,
      currencyCode: body.currencyCode,
      exchangeRate: body.exchangeRate,
    });
    return NextResponse.json({ payment });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
