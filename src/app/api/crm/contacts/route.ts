import { NextRequest, NextResponse } from 'next/server';
import { createContact } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json({ contact: await createContact(await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
