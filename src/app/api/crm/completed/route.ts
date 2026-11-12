import { NextRequest, NextResponse } from 'next/server';
import { completedDeals } from '@/lib/crm/service';
import { wonDealsCsv } from '@/lib/crm/model';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Completed (won) deals, one row per line item. `?business=` narrows to one business (or `none` for untagged), and
 * `?format=csv` returns a spreadsheet file to download instead of JSON.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const business = params.get('business');
    const { lines, truncated } = await completedDeals(business);
    if (params.get('format') === 'csv') {
      const day = new Date().toISOString().slice(0, 10);
      const slug = business && business !== 'all' ? `-${business}` : '';
      return new NextResponse('﻿' + wonDealsCsv(lines), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="completed-deals${slug}-${day}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }
    return NextResponse.json({ lines, truncated });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
