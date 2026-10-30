import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { ingestCommunication } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';
import { CHANNELS, type Channel } from '@/lib/crm/model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

type Fields = Record<string, unknown>;

async function readFields(request: NextRequest): Promise<Fields | null> {
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const j = await request.json();
      return j && typeof j === 'object' && !Array.isArray(j) ? (j as Fields) : null;
    }
    if (type.includes('form')) {
      const out: Fields = {};
      for (const [k, v] of await request.formData()) if (typeof v === 'string') out[k] = v;
      return out;
    }
  } catch {
    return null;
  }
  return null;
}

const first = (f: Fields, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = f[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
};

/** Maps what an email service, Twilio or a form posts onto the one shape the CRM records. */
function normalize(channel: Channel, f: Fields) {
  const stripWa = (s?: string) => s?.replace(/^whatsapp:/i, '');
  if (channel === 'email') {
    return {
      channel, direction: first(f, 'direction') === 'out' ? 'out' : 'in',
      from: first(f, 'from', 'From', 'sender', 'Sender'), to: first(f, 'to', 'To', 'recipient'),
      subject: first(f, 'subject', 'Subject'),
      body: first(f, 'text', 'body', 'body-plain', 'stripped-text', 'TextBody', 'plain'),
      externalId: first(f, 'messageId', 'message_id', 'Message-Id', 'MessageID', 'id'),
      occurredAt: first(f, 'date', 'Date', 'timestamp'),
    };
  }
  if (channel === 'sms' || channel === 'whatsapp') {
    return {
      channel, direction: first(f, 'direction') === 'out' ? 'out' : 'in',
      from: stripWa(first(f, 'from', 'From')), to: stripWa(first(f, 'to', 'To')),
      body: first(f, 'body', 'Body', 'text', 'message'), externalId: first(f, 'id', 'MessageSid', 'SmsSid', 'messageId'),
      name: first(f, 'name', 'ProfileName'),
    };
  }
  if (channel === 'call') {
    const dir = (first(f, 'direction', 'Direction') ?? 'inbound').toLowerCase();
    const outbound = dir === 'out' || dir.startsWith('outbound');
    const duration = Number(first(f, 'durationSeconds', 'duration', 'CallDuration'));
    return {
      channel, direction: outbound ? 'out' : 'in',
      from: first(f, 'from', 'From', 'caller'), to: first(f, 'to', 'To', 'called'),
      status: first(f, 'status', 'CallStatus'), durationSeconds: Number.isFinite(duration) ? duration : undefined,
      body: first(f, 'transcript', 'notes', 'RecordingUrl', 'recordingUrl'), externalId: first(f, 'id', 'CallSid', 'callId'),
      name: first(f, 'name', 'CallerName'),
    };
  }
  // A website form: an email address, a name and a message.
  return { channel, direction: 'in', from: first(f, 'email', 'from'), subject: first(f, 'subject') ?? 'Web form message', body: first(f, 'message', 'body', 'text'), name: first(f, 'name'), externalId: first(f, 'id') };
}

/**
 * Receives emails, texts, calls and web-form messages from outside and records them in the CRM.
 * POST /api/integrations/crm/{email|sms|whatsapp|call|web}, authorised with INTEGRATION_KEY, either as
 * "Authorization: Bearer <key>" or, for services that cannot set headers, as ?key=<key>.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  const key = process.env.INTEGRATION_KEY;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '') ?? request.nextUrl.searchParams.get('key') ?? '';
  if (!key || !sameSecret(provided, key)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { channel } = await params;
  if (!(CHANNELS as readonly string[]).includes(channel)) return NextResponse.json({ error: `Unknown channel "${channel}".` }, { status: 404 });
  const fields = await readFields(request);
  if (!fields) return NextResponse.json({ error: 'Send a JSON or form body.' }, { status: 400 });
  try {
    const result = await ingestCommunication(normalize(channel as Channel, fields));
    // Twilio expects XML back from a messaging or voice webhook; an empty response means "nothing more to do".
    if ((channel === 'sms' || channel === 'whatsapp' || channel === 'call') && (request.headers.get('content-type') ?? '').includes('form')) {
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
    }
    return NextResponse.json({ ok: true, activityId: result.activity.id, contactId: result.contact.id, duplicate: result.duplicate, newContact: result.createdContact });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
