import { NextRequest, NextResponse } from 'next/server';
import { getVendor, updateVendor, type UpdateVendorInput } from '@/lib/accounting/vendors';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

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
    const body = (await readJson(request)) as unknown as Omit<UpdateVendorInput, 'id'>;
    const vendor = await updateVendor({ id, ...body });
    return NextResponse.json({ vendor });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
