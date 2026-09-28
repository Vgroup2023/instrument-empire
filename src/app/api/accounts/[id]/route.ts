import { NextRequest, NextResponse } from 'next/server';
import { getAccount, updateAccount, type UpdateAccountInput } from '@/lib/accounting/chartOfAccounts';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const account = await getAccount(id);
    return NextResponse.json({ account });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<UpdateAccountInput, 'id'>;
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to update an account.' }, { status: 400 });
    }
    const account = await updateAccount({ id, ...body });
    return NextResponse.json({ account });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
