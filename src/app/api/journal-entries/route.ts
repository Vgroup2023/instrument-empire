import { NextRequest, NextResponse } from 'next/server';
import { createJournalEntry, listJournalEntries, listJournalEntriesPage, type CreateJournalEntryInput } from '@/lib/accounting/journalEntries';
import { parsePaging } from '@/lib/paging';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const paging = parsePaging(request.nextUrl.searchParams);
    if (paging) {
      const { items, total } = await listJournalEntriesPage(paging.limit, paging.offset);
      return NextResponse.json({ journalEntries: items, total });
    }
    const journalEntries = await listJournalEntries();
    return NextResponse.json({ journalEntries });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await readJson(request)) as unknown as CreateJournalEntryInput;
    const journalEntry = await createJournalEntry(body);
    return NextResponse.json({ journalEntry });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
