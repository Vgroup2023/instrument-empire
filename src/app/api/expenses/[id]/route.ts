import { NextRequest, NextResponse } from 'next/server';
import { deleteExpense, getExpense, updateExpense, type UpdateExpenseInput } from '@/lib/accounting/expenses';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const expense = await getExpense(id);
    return NextResponse.json({ expense });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<UpdateExpenseInput, 'id'>;
    const expense = await updateExpense({ id, ...body });
    return NextResponse.json({ expense });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteExpense(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
