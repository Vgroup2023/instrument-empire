import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { PAGE_SIZE, parsePaging } from '@/lib/paging';
import { createRfq, listRfqsPage, type CreateRfqInput } from '@/lib/quoting/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Reading drawings with Claude can take a while, so allow the longest the host permits.
export const maxDuration = 26;

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams) ?? { limit: PAGE_SIZE, offset: 0 };
    const { items, total } = await listRfqsPage(paging.limit, paging.offset);
    return NextResponse.json({ rfqs: items, total });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Files travel base64-encoded inside the JSON.
    const body = (await readJson(request, 7_000_000)) as unknown as CreateRfqInput;
    const created = await createRfq(body, 'manual');
    return NextResponse.json(created);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
