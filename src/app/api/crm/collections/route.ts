import { NextResponse } from 'next/server';
import { collections } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What each won deal's invoice has billed, collected and still owes. */
export async function GET() {
  try {
    return NextResponse.json({ collections: await collections() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
