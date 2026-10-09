import { NextRequest, NextResponse } from 'next/server';
import {
  createRecurringTemplate,
  listRecurringTemplates,
  type CreateRecurringInput,
} from '@/lib/accounting/recurring';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const templates = await listRecurringTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateRecurringInput;
    const template = await createRecurringTemplate(body);
    return NextResponse.json({ template });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
