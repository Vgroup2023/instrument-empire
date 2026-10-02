import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { withTimeout } from '@/lib/withTimeout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public, no sign-in: answers "can the server reach its database?" in under
 * 5 seconds, so a timeout on the site can be told apart from a dead database.
 * It reveals only a status word, never a connection string or error text.
 */
export async function GET() {
  const started = Date.now();
  let database: 'ok' | 'timeout' | 'unreachable' | 'not_configured' = 'ok';
  let schema: 'ok' | 'behind' | 'unknown' = 'unknown';
  try {
    const db = getDb();
    const rows = (await withTimeout(db.execute(sql`select to_regclass('public.shipment_documents')::text as latest`), 4500, 'timeout')) as unknown as { latest: string | null }[];
    // The newest table from the latest migration. Missing means `npm run db:migrate` has not been run.
    schema = rows[0]?.latest ? 'ok' : 'behind';
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    database = /DATABASE_URL is not configured/.test(msg) ? 'not_configured' : msg === 'timeout' ? 'timeout' : 'unreachable';
  }
  const ok = database === 'ok' && schema === 'ok';
  return NextResponse.json({ ok, database, schema, ms: Date.now() - started }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
