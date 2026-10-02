import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { shipments } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Milestone = 'isf' | 'entry' | 'eei' | 'invoiced';

/** PATCH { milestone } stamps a filing time; { doc, received } ticks a document; { status } closes or cancels. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      milestone?: Milestone;
      doc?: string;
      received?: boolean;
      status?: string;
      carrier?: string;
      containerNo?: string;
      lastFreeDate?: string;
    };
    const db = getDb();
    const [current] = await db.select().from(shipments).where(eq(shipments.id, id));
    if (!current) return NextResponse.json({ error: 'Shipment not found.' }, { status: 404 });

    const set: Partial<typeof shipments.$inferInsert> = { updatedAt: new Date() };
    if (body.milestone) {
      const col = { isf: 'isfFiledAt', entry: 'entryFiledAt', eei: 'eeiFiledAt', invoiced: 'invoicedAt' }[body.milestone];
      if (!col) return NextResponse.json({ error: 'Unknown milestone.' }, { status: 400 });
      set[col as 'isfFiledAt'] = new Date();
    }
    if (body.doc) {
      const docs = new Set(current.receivedDocs);
      if (body.received === false) docs.delete(body.doc);
      else docs.add(body.doc);
      set.receivedDocs = [...docs];
    }
    if (body.status) {
      if (!['open', 'completed', 'cancelled'].includes(body.status)) {
        return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
      }
      set.status = body.status as 'open' | 'completed' | 'cancelled';
    }
    if (body.carrier !== undefined) set.carrier = body.carrier.trim() || null;
    if (body.containerNo !== undefined) set.containerNo = body.containerNo.trim() || null;
    if (body.lastFreeDate !== undefined) set.lastFreeDate = body.lastFreeDate || null;
    await db.update(shipments).set(set).where(eq(shipments.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
