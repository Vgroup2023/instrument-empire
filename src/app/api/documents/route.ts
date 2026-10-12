import { NextRequest, NextResponse } from 'next/server';
import { listDocuments, uploadDocument, type DocumentEntityType, type UploadDocumentInput } from '@/lib/accounting/documents';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_ENTITY_TYPES: DocumentEntityType[] = ['invoice', 'estimate', 'customer', 'product', 'payment_link'];

export async function GET(request: NextRequest) {
  try {
    const entityType = request.nextUrl.searchParams.get('entityType') as DocumentEntityType | null;
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType)) {
      return NextResponse.json({ error: 'entityType is required.' }, { status: 400 });
    }
    const documents = await listDocuments(entityType, entityId ?? undefined);
    return NextResponse.json({ documents });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Files travel base64-encoded inside the JSON, so allow a little over the 4 MB file limit.
    const body = (await readJson(request, 6_000_000)) as unknown as UploadDocumentInput;
    const document = await uploadDocument(body);
    return NextResponse.json({ document });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
