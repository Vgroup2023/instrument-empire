import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { shipmentDocuments, shipments } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';
import { ACCEPTED_MIME, MAX_DOCUMENT_BYTES, extractInvoice, type AcceptedMime } from '@/lib/documents/extract';
import { llmEnabled } from '@/lib/llm/json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Upload a commercial invoice (PDF or image). Claude reads it; a person confirms before anything on the shipment changes. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!llmEnabled()) return NextResponse.json({ error: 'Reading documents needs Claude. Set ANTHROPIC_API_KEY on the server.' }, { status: 400 });
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
    if (!(ACCEPTED_MIME as readonly string[]).includes(file.type)) return NextResponse.json({ error: 'Upload a PDF, PNG, JPEG, WebP or GIF.' }, { status: 400 });
    if (file.size > MAX_DOCUMENT_BYTES) return NextResponse.json({ error: 'The file is over 4 MB. Upload a smaller scan or split the pages.' }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ error: 'The file is empty.' }, { status: 400 });

    const db = getDb();
    const [s] = await db.select({ id: shipments.id }).from(shipments).where(eq(shipments.id, id));
    if (!s) return NextResponse.json({ error: 'Shipment not found.' }, { status: 404 });

    const extracted = await extractInvoice(Buffer.from(await file.arrayBuffer()), file.type as AcceptedMime);
    if (!extracted) return NextResponse.json({ error: 'Could not read that document. Try a clearer copy, or enter the details by hand.' }, { status: 422 });

    const [row] = await db
      .insert(shipmentDocuments)
      .values({ shipmentId: id, docType: 'commercial_invoice', fileName: file.name.slice(0, 200), extracted: extracted as unknown as Record<string, unknown> })
      .returning({ id: shipmentDocuments.id });
    return NextResponse.json({ id: row.id, extracted });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
