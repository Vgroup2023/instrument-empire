import { NextRequest, NextResponse } from 'next/server';
import { createAccount, listAccounts, type CreateAccountInput } from '@/lib/quickbooks/chartOfAccounts';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const accounts = await listAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateAccountInput;
    if (!body.name || !body.accountType || !body.accountSubType) {
      return NextResponse.json(
        { error: 'A name, account type, and category are required.' },
        { status: 400 },
      );
    }
    const account = await createAccount(body);
    return NextResponse.json({ account });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
