import { NextRequest, NextResponse } from 'next/server';
import { createRun, listRuns } from '@/lib/payroll/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ runs: await listRuns() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createRun(await readJson(request)));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
