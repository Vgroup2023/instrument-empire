import { NextRequest, NextResponse } from 'next/server';
import { updateStaffSetup } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json({ staff: await updateStaffSetup(id, await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
