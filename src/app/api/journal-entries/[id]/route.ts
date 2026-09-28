import { NextRequest, NextResponse } from 'next/server';
import {
  deleteJournalEntry,
  getJournalEntry,
  updateJournalEntry,
  type UpdateJournalEntryInput,
} from '@/lib/quickbooks/journalEntries';
import { balanceOf } from '@/lib/quickbooks/journalEntryTypes';
import { apiErrorResponse } from '@/lib/apiError';

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
    const body = (await request.json()) as Omit<UpdateJournalEntryInput, 'id'>;
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to update a journal entry.' }, { status: 400 });
    }
    if (body.lines) {
      if (body.lines.length < 2) {
        return NextResponse.json({ error: 'A journal entry needs at least two lines.' }, { status: 400 });
      }
      if (!balanceOf(body.lines).isBalanced) {
        return NextResponse.json({ error: 'Total debits must equal total credits.' }, { status: 400 });
      }
    }
    const journalEntry = await updateJournalEntry({ id, ...body });
    return NextResponse.json({ journalEntry });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!body.syncToken) {
      return NextResponse.json({ error: 'A syncToken is required to delete a journal entry.' }, { status: 400 });
    }
    await deleteJournalEntry(id, body.syncToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
