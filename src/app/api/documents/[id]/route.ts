import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument, getDocumentContent } from '@/lib/accounting/documents';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await getDocumentContent(id);
    const buffer = Buffer.from(doc.ContentBase64, 'base64');
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': doc.ContentType,
        'Content-Disposition': `attachment; filename="${doc.FileName.replace(/"/g, "'")}"`,
        'Content-Length': String(buffer.byteLength),
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteDocument(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
