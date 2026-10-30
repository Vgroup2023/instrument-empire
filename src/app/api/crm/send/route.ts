import { NextRequest, NextResponse } from 'next/server';
import { sendToContact } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Sends an email or text to a contact right now and records it on their history. */
export async function POST(request: NextRequest) {
  try {
    return NextResponse.json({ activity: await sendToContact(await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
