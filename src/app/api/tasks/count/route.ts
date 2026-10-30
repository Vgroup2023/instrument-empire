import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current';
import { countOpen } from '@/lib/team/tasks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How many open tasks are waiting for this person. Never an error: no number is better than a broken top bar. */
export async function GET() {
  try {
    const me = await getCurrentUser();
    return NextResponse.json({ open: me ? await countOpen(me) : 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ open: 0 });
  }
}
