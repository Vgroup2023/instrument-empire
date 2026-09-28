import { NextRequest, NextResponse } from 'next/server';
import { createTransfer, listTransfers, type CreateTransferInput } from '@/lib/quickbooks/transfers';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const transfers = await listTransfers();
    return NextResponse.json({ transfers });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTransferInput;
    if (!body.fromAccountId || !body.toAccountId || !body.amount) {
      return NextResponse.json(
        { error: 'A from account, to account, and amount are required.' },
        { status: 400 },
      );
    }
    if (body.fromAccountId === body.toAccountId) {
      return NextResponse.json({ error: 'Choose two different accounts.' }, { status: 400 });
    }
    const transfer = await createTransfer(body);
    return NextResponse.json({ transfer });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
