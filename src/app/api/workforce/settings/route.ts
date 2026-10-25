import { NextRequest, NextResponse } from 'next/server';
import { getSettings, saveSettings } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ settings: await getSettings() });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PUT(request: NextRequest) {
  try {
    return NextResponse.json({ settings: await saveSettings(await readJson(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
