import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { shipmentEvents, shipments } from '@/db/schema';
import { EVENT_TYPES } from './types';

const VALID = new Set<string>(EVENT_TYPES.map((t) => t.id));

export interface NewEvent {
  shipmentId: string;
  type: string;
  location?: string;
  note?: string;
  occurredAt?: string;
  source?: string;
}

/** Adds a timeline event. A "delivered" event also stamps the shipment's delivery time. */
export async function addShipmentEvent(e: NewEvent): Promise<void> {
  if (!VALID.has(e.type)) throw new Error(`Unknown event type "${e.type}".`);
  const when = e.occurredAt ? new Date(e.occurredAt) : new Date();
  if (Number.isNaN(when.getTime())) throw new Error('occurredAt is not a valid date.');
  const db = getDb();
  await db.insert(shipmentEvents).values({
    shipmentId: e.shipmentId,
    type: e.type,
    location: e.location?.trim() || null,
    note: e.note?.trim() || null,
    source: e.source ?? 'manual',
    occurredAt: when,
  });
  if (e.type === 'delivered') {
    await db.update(shipments).set({ deliveredAt: when, updatedAt: new Date() }).where(eq(shipments.id, e.shipmentId));
  }
}
