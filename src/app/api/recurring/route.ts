import { NextRequest, NextResponse } from 'next/server';
import {
  createRecurringTemplate,
  listRecurringTemplates,
  type CreateRecurringInput,
} from '@/lib/quickbooks/recurring';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';

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
    const body = (await request.json()) as CreateRecurringInput;
    if (!body.customerId || !body.lines?.length || !body.startDate) {
      return NextResponse.json(
        { error: 'A customer, at least one line item, and a start date are required.' },
        { status: 400 },
      );
    }
    const template = await createRecurringTemplate(body);
    return NextResponse.json({ template });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
