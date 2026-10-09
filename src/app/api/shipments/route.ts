import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { shipmentLines, shipments } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';
import { listShipments } from '@/lib/agents/queries';
import { readJson } from '@/lib/http';
import { requireCustomer } from '@/lib/accounting/entryRules';
import {
  ConflictError,
  MAX_LINES,
  asRecord,
  list,
  oneOf,
  optIsoDate,
  optMoney,
  optText,
  optUuid,
  quantity,
  text,
} from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ shipments: await listShipments() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const b = asRecord(await readJson(request), 'The shipment');
    const reference = text(b.reference, 'File reference', { max: 80 });
    const customerId = optUuid(b.customerId, 'Customer');
    const direction = b.direction === undefined ? 'import' : oneOf(b.direction, 'Direction', ['import', 'export'] as const);
    const originCountry = optText(b.originCountry, 'Origin country', 60)?.toUpperCase();
    const destinationCountry = optText(b.destinationCountry, 'Destination country', 60)?.toUpperCase();
    const shipper = optText(b.shipper, 'Shipper', 200);
    const consignee = optText(b.consignee, 'Consignee', 200);
    const loadingDate = optIsoDate(b.loadingDate, 'Loading date');
    const arrivalDate = optIsoDate(b.arrivalDate, 'Arrival date');
    const declaredValue = optMoney(b.declaredValue, 'Declared value', { allowZero: true });
    const rawLines = b.lines === undefined ? [] : list(b.lines, 'Shipment lines', { max: MAX_LINES });
    const lines = rawLines
      .map((entry, index) => ({ n: index + 1, row: asRecord(entry, `Line ${index + 1}`) }))
      .filter(({ row }) => typeof row.description === 'string' && row.description.trim())
      .map(({ n, row }) => ({
        description: text(row.description, `Line ${n} description`, { max: 500 }),
        htsCode: optText(row.htsCode, `Line ${n} HTS code`, 20),
        quantity: row.quantity === undefined || row.quantity === null ? undefined : quantity(row.quantity, `Line ${n} quantity`),
        value: optMoney(row.value, `Line ${n} value`, { allowZero: true }),
        eccn: optText(row.eccn, `Line ${n} ECCN`, 20),
      }));

    const db = getDb();
    const id = await db.transaction(async (tx) => {
      if (customerId) await requireCustomer(tx, customerId);
      const [dupe] = await tx
        .select({ id: shipments.id })
        .from(shipments)
        .where(sql`lower(${shipments.reference}) = lower(${reference})`)
        .limit(1);
      if (dupe) throw new ConflictError(`A shipment file with reference "${reference}" already exists.`);
      const [row] = await tx
        .insert(shipments)
        .values({
          reference,
          customerId: customerId ?? null,
          direction,
          originCountry: originCountry ?? null,
          destinationCountry: destinationCountry ?? null,
          shipper: shipper ?? null,
          consignee: consignee ?? null,
          loadingDate: loadingDate ?? null,
          arrivalDate: arrivalDate ?? null,
          declaredValue: declaredValue === undefined ? null : declaredValue.toFixed(2),
        })
        .returning();
      if (lines.length) {
        await tx.insert(shipmentLines).values(
          lines.map((l) => ({
            shipmentId: row.id,
            description: l.description,
            htsCode: l.htsCode ?? null,
            quantity: l.quantity === undefined ? null : String(l.quantity),
            value: l.value === undefined ? null : l.value.toFixed(2),
            eccn: l.eccn ?? null,
          })),
        );
      }
      return row.id;
    });
    return NextResponse.json({ id });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
