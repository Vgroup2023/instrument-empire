import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { deleteFile, downloadTarget, renameFile } from '@/lib/files/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** An address to open or download the file from. `?inline=1` shows it in the browser instead of saving it. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const inline = request.nextUrl.searchParams.get('inline') === '1';
    const target = await downloadTarget(id, inline);
    if (target.kind === 'url') return NextResponse.json({ url: target.url });
    return NextResponse.json({ url: `/api/files/${id}/content${inline ? '?inline=1' : ''}` });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    return NextResponse.json({ file: await renameFile((await params).id, await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await deleteFile((await params).id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
