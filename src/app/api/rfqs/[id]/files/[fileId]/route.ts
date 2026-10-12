import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { getRfqFile } from '@/lib/quoting/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const { id, fileId } = await params;
    const f = await getRfqFile(id, fileId);
    const safeName = f.fileName.replace(/[^\w.\- ]/g, '_');
    return new NextResponse(Buffer.from(f.contentBase64, 'base64'), {
      headers: {
        // Attachments are customer files: always download, never render in the app's own origin.
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
