import { NextRequest, NextResponse } from 'next/server';
import { deleteContact, updateContact } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJsonAsUser } from '@/lib/crm/signedBody';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ contact: await updateContact(id, await readJsonAsUser(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteContact(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
