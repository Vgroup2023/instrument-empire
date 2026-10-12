import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { handleInbound } from '@/lib/desk/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Signed-in staff entering an order or a customer message by hand. */
export async function POST(request: NextRequest) {
  try {
    return await handleInbound(await readJson(request), 'manual');
  } catch (err) {
    return apiErrorResponse(err);
  }
}
