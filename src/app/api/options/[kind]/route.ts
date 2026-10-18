import { NextRequest, NextResponse } from 'next/server';
import { listCustomerOptions } from '@/lib/accounting/customers';
import { listVendorOptions } from '@/lib/accounting/vendors';
import { listProductOptions } from '@/lib/accounting/products';
import { SEARCH_LIMIT } from '@/lib/optionSearch';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LISTERS = { customers: listCustomerOptions, vendors: listVendorOptions, products: listProductOptions } as const;

/** Drop-down search: ?q= finds matches by name, ?id= fetches the one already chosen (so an older document still shows it). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params;
    if (!(kind in LISTERS)) return NextResponse.json({ error: 'Unknown list.' }, { status: 404 });
    const list = LISTERS[kind as keyof typeof LISTERS];
    const id = request.nextUrl.searchParams.get('id') ?? undefined;
    const q = request.nextUrl.searchParams.get('q') ?? undefined;
    const items = await list({ id, q, limit: SEARCH_LIMIT });
    return NextResponse.json({ items });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
