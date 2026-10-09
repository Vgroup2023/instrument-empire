import { NextRequest, NextResponse } from 'next/server';
import { getProduct, updateProduct, type UpdateProductInput } from '@/lib/accounting/products';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

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
    const body = (await readJson(request)) as unknown as Omit<UpdateProductInput, 'id'>;
    const product = await updateProduct({ id, ...body });
    return NextResponse.json({ product });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
