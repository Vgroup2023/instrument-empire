import { NextRequest, NextResponse } from 'next/server';
import { getVendor, updateVendor, type UpdateVendorInput } from '@/lib/quickbooks/vendors';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const vendor = await getVendor(id);
    return NextResponse.json({ vendor });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<UpdateVendorInput, 'id'>;
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to update a vendor.' }, { status: 400 });
    }
    const vendor = await updateVendor({ id, ...body });
    return NextResponse.json({ vendor });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
