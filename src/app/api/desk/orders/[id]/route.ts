import { NextRequest, NextResponse } from 'next/server';
import { approveReview, cancelOrder, deliverOrder, shipOrder } from '@/lib/desk/actions';
import { runDesk } from '@/lib/desk/agents';
import { deskError } from '@/lib/desk/api';
import { readJson } from '@/lib/http';
import { uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    uuid(id, 'Record');
    const b = (await readJson(request)) as unknown as { action?: string; carrier?: string; trackingNo?: string };
    switch (b.action) {
      case 'approve':
        await approveReview(id);
        await runDesk();
        return NextResponse.json({ ok: true });
      case 'cancel':
        await cancelOrder(id, 'staff', 'Cancelled by staff.');
        await runDesk();
        return NextResponse.json({ ok: true });
      case 'ship':
        return NextResponse.json(await shipOrder(id, { carrier: b.carrier ?? '', trackingNo: b.trackingNo ?? '' }));
      case 'deliver':
        await deliverOrder(id);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
  } catch (err) {
    return deskError(err);
  }
}
