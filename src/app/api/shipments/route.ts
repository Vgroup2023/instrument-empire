import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { shipmentLines, shipments } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';
import { listShipments } from '@/lib/agents/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CreateBody {
  reference?: string;
  customerId?: string;
  direction?: 'import' | 'export';
  originCountry?: string;
  destinationCountry?: string;
  shipper?: string;
  consignee?: string;
  loadingDate?: string;
  arrivalDate?: string;
  declaredValue?: number;
  lines?: { description: string; htsCode?: string; quantity?: number; value?: number; eccn?: string }[];
}

export async function GET() {
  try {
    return NextResponse.json({ shipments: await listShipments() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const b = (await request.json()) as CreateBody;
    if (!b.reference?.trim()) return NextResponse.json({ error: 'A file reference is required.' }, { status: 400 });
    const db = getDb();
    const [row] = await db
      .insert(shipments)
      .values({
        reference: b.reference.trim(),
        customerId: b.customerId || null,
        direction: b.direction === 'export' ? 'export' : 'import',
        originCountry: b.originCountry?.trim().toUpperCase() || null,
        destinationCountry: b.destinationCountry?.trim().toUpperCase() || null,
        shipper: b.shipper?.trim() || null,
        consignee: b.consignee?.trim() || null,
        loadingDate: b.loadingDate || null,
        arrivalDate: b.arrivalDate || null,
        declaredValue: b.declaredValue === undefined ? null : String(b.declaredValue),
      })
      .returning();
    const lines = (b.lines ?? []).filter((l) => l.description?.trim());
    if (lines.length) {
      await db.insert(shipmentLines).values(
        lines.map((l) => ({
          shipmentId: row.id,
          description: l.description.trim(),
          htsCode: l.htsCode?.trim() || null,
          quantity: l.quantity === undefined ? null : String(l.quantity),
          value: l.value === undefined ? null : String(l.value),
          eccn: l.eccn?.trim() || null,
        })),
      );
    }
    return NextResponse.json({ id: row.id });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
