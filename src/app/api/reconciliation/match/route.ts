import { NextRequest, NextResponse } from 'next/server';
import { reconcileStatement } from '@/lib/accounting/reconciliation';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as { accountId?: string; csvText?: string };
    if (!body.accountId || !body.csvText?.trim()) {
      return NextResponse.json({ error: 'Choose an account and provide statement data.' }, { status: 400 });
    }
    const result = await reconcileStatement(body.accountId, body.csvText);
    return NextResponse.json({ result });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
