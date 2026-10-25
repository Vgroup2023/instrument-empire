import { NextRequest, NextResponse } from 'next/server';
import { getPaySettings, savePaySettings } from '@/lib/payroll/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ settings: await getPaySettings() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    return NextResponse.json({ settings: await savePaySettings(await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
