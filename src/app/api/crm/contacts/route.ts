import { NextRequest, NextResponse } from 'next/server';
import { createContact } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJsonAsUser } from '@/lib/crm/signedBody';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json({ contact: await createContact(await readJsonAsUser(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
