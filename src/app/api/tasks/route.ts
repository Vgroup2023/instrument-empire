import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current';
import { createTask, listTasks } from '@/lib/team/tasks';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const box = request.nextUrl.searchParams.get('box');
    return NextResponse.json({ tasks: await listTasks(me, box === 'sent' || box === 'done' ? box : 'inbox') });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** { title, detail?, toDepartment?, toUserId?, dueDate? }: hands work to a department or a person. */
export async function POST(request: NextRequest) {
  try {
    const me = await getCurrentUser();
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ task: await createTask(me, await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
