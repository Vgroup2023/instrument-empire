import { NextResponse } from 'next/server';
import { getTabStatus } from '@/lib/tabStatus';
import { withTimeout } from '@/lib/withTimeout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What the top bar's bells count: urgent agent findings, and work waiting on a person. Never an error: no number is better than a broken bar. */
export async function GET() {
  try {
    const status = await withTimeout(getTabStatus(), 3500, 'Counts took too long.');
    const count = (label: string) => status.attention.find((a) => a.label === label)?.count ?? 0;
    return NextResponse.json({
      urgent: count('Critical or high findings'),
      waiting: count('Orders to review or on hold') + count('Customer replies waiting') + count('Quotes waiting for estimator review'),
    });
  } catch {
    return NextResponse.json({ urgent: 0, waiting: 0 });
  }
}
