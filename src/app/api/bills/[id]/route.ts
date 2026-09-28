import { NextRequest, NextResponse } from 'next/server';
import { deleteBill, getBill, updateBill, type UpdateBillInput } from '@/lib/quickbooks/bills';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bill = await getBill(id);
    return NextResponse.json({ bill });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<UpdateBillInput, 'id'>;
    const bill = await updateBill({ id, ...body });
    return NextResponse.json({ bill });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to delete a bill.' }, { status: 400 });
    }
    await deleteBill(id, body.syncToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
