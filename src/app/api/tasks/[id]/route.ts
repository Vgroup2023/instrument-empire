import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current';
import { setTaskStatus } from '@/lib/team/tasks';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { asRecord, uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** { status: "open" | "done" | "dismissed" } */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    uuid(id, 'Task');
    return NextResponse.json({ task: await setTaskStatus(me, id, asRecord(await readJson(request)).status) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
