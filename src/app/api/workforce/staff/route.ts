import { NextResponse } from 'next/server';
import { listStaff } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ staff: await listStaff() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
