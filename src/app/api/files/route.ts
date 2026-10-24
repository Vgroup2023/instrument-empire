import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { listFiles, startUpload } from '@/lib/files/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const result = await listFiles({ q: p.get('q') ?? undefined, group: p.get('group') ?? undefined, limit: Number(p.get('limit')) || undefined, offset: Number(p.get('offset')) || undefined });
    return NextResponse.json(result);
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** Starts an upload. With object storage this returns an address for the browser to send the file to; without it the file comes in this request. */
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await startUpload(await readJson(request, 6_000_000)));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
