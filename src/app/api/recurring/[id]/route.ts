import { NextRequest, NextResponse } from 'next/server';
import { deleteRecurringTemplate, setRecurringActive } from '@/lib/quickbooks/recurring';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as { active: boolean };
    await setRecurringActive(params.id, body.active);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteRecurringTemplate(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
