import { NextRequest, NextResponse } from 'next/server';
import { createVendor, listVendors, listVendorsPage, type CreateVendorInput } from '@/lib/accounting/vendors';
import { parsePaging } from '@/lib/paging';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams);
    if (paging) {
      const { items, total } = await listVendorsPage(paging.limit, paging.offset);
      return NextResponse.json({ vendors: items, total });
    }
    const vendors = await listVendors();
    return NextResponse.json({ vendors });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateVendorInput;
    if (!body.displayName) {
      return NextResponse.json({ error: 'A vendor name is required.' }, { status: 400 });
    }
    const vendor = await createVendor(body);
    return NextResponse.json({ vendor });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
