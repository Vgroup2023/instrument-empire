import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { downloadTarget } from '@/lib/files/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INLINE_OK = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/;

/** Bytes of a file kept in the database (the fallback when object storage is not set up). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const target = await downloadTarget(id, false);
    if (target.kind === 'url') return NextResponse.redirect(target.url, 302);
    const inline = request.nextUrl.searchParams.get('inline') === '1' && INLINE_OK.test(target.contentType);
    const ascii = target.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    return new NextResponse(new Uint8Array(target.bytes), {
      headers: {
        'Content-Type': target.contentType,
        'Content-Length': String(target.bytes.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(target.name)}`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
