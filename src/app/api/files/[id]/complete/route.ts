import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { completeUpload } from '@/lib/files/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The browser calls this when its upload to storage has finished. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ file: await completeUpload((await params).id) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
