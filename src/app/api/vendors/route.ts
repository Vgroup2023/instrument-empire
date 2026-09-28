import { NextRequest, NextResponse } from 'next/server';
import { createVendor, listVendors, type CreateVendorInput } from '@/lib/quickbooks/vendors';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const vendors = await listVendors();
    return NextResponse.json({ vendors });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateVendorInput;
    if (!body.displayName) {
      return NextResponse.json({ error: 'A vendor name is required.' }, { status: 400 });
    }
    const vendor = await createVendor(body);
    return NextResponse.json({ vendor });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
