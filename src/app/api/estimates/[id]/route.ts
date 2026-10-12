import { NextRequest, NextResponse } from 'next/server';
import { deleteEstimate, getEstimate, updateEstimate, type UpdateEstimateInput } from '@/lib/accounting/estimates';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const estimate = await getEstimate(id);
    return NextResponse.json({ estimate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await readJson(request)) as unknown as Omit<UpdateEstimateInput, 'id'>;
    const estimate = await updateEstimate({ id, ...body });
    return NextResponse.json({ estimate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteEstimate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
