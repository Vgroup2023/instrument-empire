import { NextRequest, NextResponse } from 'next/server';
import { deleteExpense, getExpense, updateExpense, type UpdateExpenseInput } from '@/lib/quickbooks/expenses';
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
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to update an expense.' }, { status: 400 });
    }
    const expense = await updateExpense({ id, ...body });
    return NextResponse.json({ expense });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to delete an expense.' }, { status: 400 });
    }
    await deleteExpense(id, body.syncToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
