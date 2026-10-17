import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

import { approveLine, ignoreLine } from '@/lib/bookkeeping/service';
import { ValidationError } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await readJson(request);
    if (body.action === 'ignore') {
      await ignoreLine(id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'approve') return NextResponse.json({ result: await approveLine(id, body) });
    throw new ValidationError('Choose approve or ignore.');
  } catch (err) {
    return apiErrorResponse(err);
  }
}
