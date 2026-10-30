import { NextRequest, NextResponse } from 'next/server';
import { actOnDraft } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** { action: "send" | "dismiss", subject?, body?, actor? }: sends a draft (after any edits) or dismisses it. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await actOnDraft(id, await readJson(request)));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
