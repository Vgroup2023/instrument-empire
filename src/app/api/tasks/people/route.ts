import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current';
import { listUsers } from '@/lib/auth/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Names only, so anyone can hand work to a colleague. No emails or roles. */
export async function GET() {
  try {
    if (!(await getCurrentUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const people = (await listUsers()).filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.name, departments: u.departments }));
    return NextResponse.json({ people });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
