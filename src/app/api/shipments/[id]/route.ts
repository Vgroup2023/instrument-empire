import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { shipments } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { NotFoundError, ValidationError, asRecord, oneOf, optIsoDate, optText, uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** PATCH { milestone } stamps a filing time; { doc, received } ticks a document; { status } closes or cancels. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    uuid(id, 'Shipment');
    const body = asRecord(await readJson(request), 'The update');
    const milestone = body.milestone === undefined ? undefined : oneOf(body.milestone, 'Milestone', ['isf', 'entry', 'eei', 'invoiced'] as const);
    const doc = optText(body.doc, 'Document', 60);
    if (body.received !== undefined && typeof body.received !== 'boolean') throw new ValidationError('Received must be true or false.');
    const status = body.status === undefined ? undefined : oneOf(body.status, 'Status', ['open', 'completed', 'cancelled'] as const);
    const carrier = body.carrier === undefined ? undefined : (optText(body.carrier, 'Carrier', 120) ?? null);
    const containerNo = body.containerNo === undefined ? undefined : (optText(body.containerNo, 'Container number', 40) ?? null);
    const lastFreeDate = body.lastFreeDate === undefined ? undefined : (optIsoDate(body.lastFreeDate, 'Last free date') ?? null);

    const db = getDb();
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(shipments).where(eq(shipments.id, id)).for('update');
      if (!current) throw new NotFoundError('Shipment not found.');

      const set: Partial<typeof shipments.$inferInsert> = { updatedAt: new Date() };
      if (milestone) {
        const col = { isf: 'isfFiledAt', entry: 'entryFiledAt', eei: 'eeiFiledAt', invoiced: 'invoicedAt' }[milestone];
        set[col as 'isfFiledAt'] = new Date();
      }
      if (doc) {
        const docs = new Set(current.receivedDocs);
        if (body.received === false) docs.delete(doc);
        else docs.add(doc);
        set.receivedDocs = [...docs];
      }
      if (status) set.status = status;
      if (carrier !== undefined) set.carrier = carrier;
      if (containerNo !== undefined) set.containerNo = containerNo;
      if (lastFreeDate !== undefined) set.lastFreeDate = lastFreeDate;
      await tx.update(shipments).set(set).where(eq(shipments.id, id));
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
