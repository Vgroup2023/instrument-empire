import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@/db/schema';

/**
 * Uses Neon's HTTP driver rather than a pooled TCP connection — each
 * serverless function invocation (Netlify Functions) gets a fresh
 * short-lived request instead of holding a socket open, which is what this
 * hosting model needs.
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not configured on the server. Add it as an environment variable ' +
        '(a Postgres connection string from Neon, Supabase, or another provider).',
    );
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

let cached: ReturnType<typeof createDb> | undefined;

/** Lazily creates the DB client on first use, so importing this module never throws when DATABASE_URL is unset (e.g. during a build). */
export function getDb() {
  if (!cached) cached = createDb();
  return cached;
}
