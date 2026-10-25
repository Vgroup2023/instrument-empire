import { NextRequest, NextResponse } from 'next/server';
import { parseQuarter, pbjFile } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The PBJ XML for CMS. A file with problems is refused unless force=1, so a half-finished quarter is never sent by mistake. */
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const processType = p.get('processType') === 'merge' ? 'merge' : 'replace';
    const file = await pbjFile(parseQuarter(p.get('fy'), p.get('q')), processType);
    if (!file.ready && p.get('force') !== '1') {
      return NextResponse.json({ error: 'This quarter still has problems to fix before the file is ready for CMS.', issues: file.issues }, { status: 409 });
    }
    return new NextResponse(file.xml, {
      headers: {
        'Content-Type': 'application/xml; charset=us-ascii',
        'Content-Disposition': `attachment; filename="${file.filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
