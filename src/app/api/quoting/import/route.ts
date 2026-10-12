import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { importCsv } from '@/lib/quoting/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST { kind: "prices" | "jobs", csv: "<header row>\n<rows>" } */
export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request, 1_200_000);
    return NextResponse.json(await importCsv(String(body.kind), body.csv));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
