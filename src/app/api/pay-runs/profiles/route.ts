import { NextResponse } from 'next/server';
import { listPayProfiles } from '@/lib/payroll/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ profiles: await listPayProfiles() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
