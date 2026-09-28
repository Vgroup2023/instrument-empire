import { NextRequest, NextResponse } from 'next/server';
import { deleteTransfer, updateTransfer, type UpdateTransferInput } from '@/lib/accounting/transfers';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<UpdateTransferInput, 'id'>;
    const transfer = await updateTransfer({ id, ...body });
    return NextResponse.json({ transfer });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteTransfer(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
