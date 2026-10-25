import { NextRequest, NextResponse } from 'next/server';
import { savePayProfile } from '@/lib/payroll/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  try {
    return NextResponse.json({ profile: await savePayProfile((await params).employeeId, await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
