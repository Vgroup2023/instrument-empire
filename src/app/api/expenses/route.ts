import { NextRequest, NextResponse } from 'next/server';
import { createExpense, listExpenses, listExpensesPage, type CreateExpenseInput } from '@/lib/accounting/expenses';
import { parsePaging } from '@/lib/paging';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams);
    if (paging) {
      const { items, total } = await listExpensesPage(paging.limit, paging.offset);
      return NextResponse.json({ expenses: items, total });
    }
    const expenses = await listExpenses();
    return NextResponse.json({ expenses });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateExpenseInput;
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
