import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/lib/crm/agents';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { asRecord, oneOf } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 26;

/** { kind: "daily" | "weekly" }: writes (or rewrites) this period's report now. */
export async function POST(request: NextRequest) {
  try {
    const kind = oneOf(asRecord(await readJson(request)).kind, 'Report type', ['daily', 'weekly'] as const);
    return NextResponse.json(await generateReport(kind, { force: true }));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
