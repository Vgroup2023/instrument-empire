import { NextRequest, NextResponse } from 'next/server';
import { deleteTransfer, updateTransfer, type UpdateTransferInput } from '@/lib/quickbooks/transfers';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<UpdateTransferInput, 'id'>;
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to update a transfer.' }, { status: 400 });
    }
    const transfer = await updateTransfer({ id, ...body });
    return NextResponse.json({ transfer });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to delete a transfer.' }, { status: 400 });
    }
    await deleteTransfer(id, body.syncToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
