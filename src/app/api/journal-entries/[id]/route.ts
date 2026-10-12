import { NextRequest, NextResponse } from 'next/server';
import {
  deleteJournalEntry,
  getJournalEntry,
  updateJournalEntry,
  type UpdateJournalEntryInput,
} from '@/lib/accounting/journalEntries';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const journalEntry = await getJournalEntry(id);
    return NextResponse.json({ journalEntry });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await readJson(request)) as unknown as Omit<UpdateJournalEntryInput, 'id'>;
    const journalEntry = await updateJournalEntry({ id, ...body });
    return NextResponse.json({ journalEntry });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await deleteJournalEntry(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
