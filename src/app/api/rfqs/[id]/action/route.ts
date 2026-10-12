import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { rfqAction } from '@/lib/quoting/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { action: approve | return | decline | reopen | won | lost | to-estimate, note?, acknowledgedFlags?, customerId? } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ rfq: await rfqAction(id, await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
