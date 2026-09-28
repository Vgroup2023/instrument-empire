import { NextResponse } from 'next/server';
import { duplicateBill } from '@/lib/quickbooks/bills';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bill = await duplicateBill(id);
    return NextResponse.json({ bill });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
