import { NextRequest, NextResponse } from 'next/server';
import { createExpense, listExpenses, type CreateExpenseInput } from '@/lib/quickbooks/expenses';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const expenses = await listExpenses();
    return NextResponse.json({ expenses });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateExpenseInput;
    if (!body.paymentAccountId || !body.paymentType || !body.lines?.length) {
      return NextResponse.json(
        { error: 'A payment account, payment type, and at least one expense line are required.' },
        { status: 400 },
      );
    }
    const expense = await createExpense(body);
    return NextResponse.json({ expense });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
