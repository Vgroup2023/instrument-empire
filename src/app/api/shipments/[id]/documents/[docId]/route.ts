import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { shipmentDocuments, shipmentLines, shipments } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';
import type { ExtractedInvoice } from '@/lib/documents/extract';
import { isValidHts } from '@/lib/agents/hts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { action: "apply" | "discard" }. Apply fills only what is blank on the shipment and never overwrites. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    const { id, docId } = await params;
    const { action } = (await request.json()) as { action?: string };
    const db = getDb();
    const [doc] = await db.select().from(shipmentDocuments).where(and(eq(shipmentDocuments.id, docId), eq(shipmentDocuments.shipmentId, id)));
    if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

    if (action === 'discard') {
      await db.delete(shipmentDocuments).where(eq(shipmentDocuments.id, docId));
      return NextResponse.json({ ok: true });
    }
    if (action !== 'apply') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    if (doc.status === 'applied') return NextResponse.json({ error: 'This document was already applied.' }, { status: 400 });

    const inv = doc.extracted as unknown as ExtractedInvoice;
    const [s] = await db.select().from(shipments).where(eq(shipments.id, id));
    if (!s) return NextResponse.json({ error: 'Shipment not found.' }, { status: 404 });
    const usd = !inv.currency || inv.currency === 'USD';
    const changed: string[] = [];

    const set: Partial<typeof shipments.$inferInsert> = { updatedAt: new Date() };
    if (!s.shipper && inv.seller) {
      set.shipper = inv.seller;
      changed.push('shipper');
    }
    if (!s.consignee && inv.buyer) {
      set.consignee = inv.buyer;
      changed.push('consignee');
    }
    if (s.declaredValue === null && inv.total !== null && usd) {
      set.declaredValue = String(inv.total);
      changed.push('declared value');
    }
    if (!s.receivedDocs.includes('commercial_invoice')) {
      set.receivedDocs = [...s.receivedDocs, 'commercial_invoice'];
      changed.push('commercial invoice ticked as received');
    }
    const existing = await db.select({ id: shipmentLines.id }).from(shipmentLines).where(eq(shipmentLines.shipmentId, id));
    if (!existing.length && inv.lines.length) {
      await db.insert(shipmentLines).values(
        inv.lines.map((l) => ({
          shipmentId: id,
          description: l.description,
          // A code printed on the invoice is only kept if it has the shape of a US HTS number.
          htsCode: l.htsCode && isValidHts(l.htsCode) ? l.htsCode : null,
          quantity: l.quantity === null ? null : String(l.quantity),
          value: l.amount !== null && usd ? String(l.amount) : null,
        })),
      );
      changed.push(`${inv.lines.length} line(s)`);
    }
    await db.update(shipments).set(set).where(eq(shipments.id, id));
    await db.update(shipmentDocuments).set({ status: 'applied', updatedAt: new Date() }).where(eq(shipmentDocuments.id, docId));
    return NextResponse.json({ ok: true, changed });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
