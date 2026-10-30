import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { crmActivities, crmContacts } from '@/db/schema';
import { apiErrorResponse } from '@/lib/apiError';
import { NotFoundError, uuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** A calendar file (.ics) for a scheduled meeting or task, to add to Google, Outlook or Apple Calendar. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    uuid(id, 'Meeting');
    const db = getDb();
    const [a] = await db.select().from(crmActivities).where(eq(crmActivities.id, id));
    if (!a || !a.dueAt) throw new NotFoundError('That meeting has no scheduled time.');
    const [c] = a.contactId ? await db.select().from(crmContacts).where(eq(crmContacts.id, a.contactId)) : [];
    const end = new Date(a.dueAt.getTime() + (a.durationSeconds ? a.durationSeconds * 1000 : 30 * 60_000));
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GloblexAI Office ERP//CRM//EN', 'BEGIN:VEVENT',
      `UID:${a.id}@globlexai-crm`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(a.dueAt)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(a.summary)}`,
      ...(a.detail || c ? [`DESCRIPTION:${esc([c ? `With ${c.name}${c.company ? ` (${c.company})` : ''}` : '', a.detail ?? ''].filter(Boolean).join('\n'))}`] : []),
      'END:VEVENT', 'END:VCALENDAR',
    ];
    return new NextResponse(lines.join('\r\n') + '\r\n', {
      headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="meeting-${a.id.slice(0, 8)}.ics"` },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
