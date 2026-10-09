import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { warehouseReceipts } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  binLocation?: string;
  expectedPieces?: number | null;
  receivedPieces?: number | null;
  damagedPieces?: number;
  freeDays?: number;
  dailyRate?: number | null;
  /** Stamp receivedAt now (first receipt). */
  received?: boolean;
  /** Stamp releasedAt now. */
  released?: boolean;
  storageBilled?: boolean;
}

/** Creates or updates the single warehouse receipt for a shipment. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = (await readJson(request)) as unknown as Body;
    for (const [k, v] of Object.entries({ expectedPieces: b.expectedPieces, receivedPieces: b.receivedPieces, damagedPieces: b.damagedPieces, freeDays: b.freeDays, dailyRate: b.dailyRate })) {
      if (v !== undefined && v !== null && (typeof v !== 'number' || v < 0 || Number.isNaN(v))) {
        return NextResponse.json({ error: `${k} must be a number of 0 or more.` }, { status: 400 });
      }
    }
    const db = getDb();
    const values: Partial<typeof warehouseReceipts.$inferInsert> = { updatedAt: new Date() };
    if (b.binLocation !== undefined) values.binLocation = b.binLocation.trim() || null;
    if (b.expectedPieces !== undefined) values.expectedPieces = b.expectedPieces;
    if (b.receivedPieces !== undefined) values.receivedPieces = b.receivedPieces;
    if (b.damagedPieces !== undefined) values.damagedPieces = b.damagedPieces;
    if (b.freeDays !== undefined) values.freeDays = b.freeDays ?? 5;
    if (b.dailyRate !== undefined) values.dailyRate = b.dailyRate === null ? null : String(b.dailyRate);

    const [existing] = await db.select().from(warehouseReceipts).where(eq(warehouseReceipts.shipmentId, id));
    if (b.received && !existing?.receivedAt) values.receivedAt = new Date();
    if (b.released) {
      if (!existing?.receivedAt && !values.receivedAt) return NextResponse.json({ error: 'Receive the goods before releasing them.' }, { status: 400 });
      values.releasedAt = new Date();
    }
    if (b.storageBilled) values.storageBilledAt = new Date();

    if (existing) await db.update(warehouseReceipts).set(values).where(eq(warehouseReceipts.id, existing.id));
    else await db.insert(warehouseReceipts).values({ shipmentId: id, ...values });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
