import { NextRequest, NextResponse } from 'next/server';
import { sendEstimate } from '@/lib/quickbooks/estimates';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const estimate = await sendEstimate(id, body.email);
    return NextResponse.json({ estimate });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
