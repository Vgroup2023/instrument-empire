import { NextRequest, NextResponse } from 'next/server';
import { getProduct, updateProduct, type UpdateProductInput } from '@/lib/quickbooks/items';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const product = await getProduct(id);
    return NextResponse.json({ product });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Omit<UpdateProductInput, 'id'>;
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to update a product/service.' }, { status: 400 });
    }
    const product = await updateProduct({ id, ...body });
    return NextResponse.json({ product });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
