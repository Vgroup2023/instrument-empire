import { NextRequest, NextResponse } from 'next/server';
import { createJournalEntry, listJournalEntries, type CreateJournalEntryInput } from '@/lib/quickbooks/journalEntries';
import { balanceOf } from '@/lib/quickbooks/journalEntryTypes';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const journalEntries = await listJournalEntries();
    return NextResponse.json({ journalEntries });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateJournalEntryInput;
    if (!body.lines?.length || body.lines.length < 2) {
      return NextResponse.json({ error: 'A journal entry needs at least two lines.' }, { status: 400 });
    }
    if (!balanceOf(body.lines).isBalanced) {
      return NextResponse.json({ error: 'Total debits must equal total credits.' }, { status: 400 });
    }
    const journalEntry = await createJournalEntry(body);
    return NextResponse.json({ journalEntry });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
