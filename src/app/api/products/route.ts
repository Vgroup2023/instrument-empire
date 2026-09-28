import { NextRequest, NextResponse } from 'next/server';
import { createProduct, listProducts, type CreateProductInput } from '@/lib/quickbooks/items';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const products = await listProducts();
    return NextResponse.json({ products });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateProductInput;
    if (!body.name) {
      return NextResponse.json({ error: 'A product/service name is required.' }, { status: 400 });
    }
    if (!body.incomeAccountId) {
      return NextResponse.json({ error: 'Choose which income account this posts to.' }, { status: 400 });
    }
    const product = await createProduct(body);
    return NextResponse.json({ product });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
