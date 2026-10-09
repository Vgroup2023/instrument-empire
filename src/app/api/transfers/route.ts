import { NextRequest, NextResponse } from 'next/server';
import { createTransfer, listTransfers, listTransfersPage, type CreateTransferInput } from '@/lib/accounting/transfers';
import { parsePaging } from '@/lib/paging';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams);
    if (paging) {
      const { items, total } = await listTransfersPage(paging.limit, paging.offset);
      return NextResponse.json({ transfers: items, total });
    }
    const transfers = await listTransfers();
    return NextResponse.json({ transfers });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateTransferInput;
    const transfer = await createTransfer(body);
    return NextResponse.json({ transfer });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
