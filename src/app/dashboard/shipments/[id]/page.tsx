import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { getShipmentDetail } from '@/lib/agents/queries';
import { ShipmentDetailClient } from '@/components/agents/ShipmentDetailClient';

export const dynamic = 'force-dynamic';

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail: Awaited<ReturnType<typeof getShipmentDetail>> | undefined;
  let loadError: unknown = null;
  try {
    detail = await getShipmentDetail(id);
  } catch (err) {
    loadError = err;
  }
  if (loadError) {
    return (
      <div>
        <PageHeader title="Shipment" />
        <EmptyState title="Couldn't load this shipment" description={describeError(loadError, 'Please try again.')} />
      </div>
    );
  }
  if (!detail) notFound();

  const { shipment: s, receipt: r } = detail;
  return (
    <ShipmentDetailClient
      shipment={{
        id: s.id,
        reference: s.reference,
        direction: s.direction,
        status: s.status,
        customerName: detail.customerName,
        carrier: s.carrier,
        containerNo: s.containerNo,
        lastFreeDate: s.lastFreeDate,
        loadingDate: s.loadingDate,
        arrivalDate: s.arrivalDate,
        receivedDocs: s.receivedDocs,
        invoicedAt: s.invoicedAt?.toISOString() ?? null,
        deliveredAt: s.deliveredAt?.toISOString() ?? null,
      }}
      events={detail.events.map((e) => ({ id: e.id, type: e.type, location: e.location, note: e.note, source: e.source, occurredAt: e.occurredAt.toISOString() }))}
      receipt={
        r
          ? {
              binLocation: r.binLocation,
              expectedPieces: r.expectedPieces,
              receivedPieces: r.receivedPieces,
              damagedPieces: r.damagedPieces,
              receivedAt: r.receivedAt?.toISOString() ?? null,
              releasedAt: r.releasedAt?.toISOString() ?? null,
              freeDays: r.freeDays,
              dailyRate: r.dailyRate === null ? null : Number(r.dailyRate),
              storageBilledAt: r.storageBilledAt?.toISOString() ?? null,
            }
          : null
      }
      findings={detail.findings.map((f) => ({ id: f.id, severity: f.severity, title: f.title, detail: f.detail, department: f.department }))}
    />
  );
}
