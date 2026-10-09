import { NextRequest, NextResponse } from 'next/server';
import { closeServiceMessage, sendServiceReply } from '@/lib/desk/actions';
import { deskError } from '@/lib/desk/api';
import { readJson } from '@/lib/http';
import { uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    uuid(id, 'Record');
    const b = (await readJson(request)) as unknown as { action?: string; reply?: string };
    if (b.action === 'send') {
      await sendServiceReply(id, b.reply ?? '');
      return NextResponse.json({ ok: true });
    }
    if (b.action === 'close') {
      await closeServiceMessage(id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err) {
    return deskError(err);
  }
}
