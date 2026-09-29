import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';

/**
 * A standard Postgres connection (works with Supabase, Neon, RDS, or any
 * other Postgres host) rather than a provider-specific driver. Netlify
 * Functions run in a normal Node.js runtime, so a pooled TCP connection is
 * fine here — this isn't an edge runtime that would need an HTTP-based driver.
 */
function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not configured on the server. Add it as an environment variable ' +
        '(a Postgres connection string from Supabase, Neon, or another provider).',
    );
  }
  // max: 1 keeps each serverless function instance's own connection footprint
  // small — pair this with your provider's pooled connection string (e.g.
  // Supabase's "Transaction pooler" on port 6543) rather than a direct one.
  // prepare: false is required for that pooler: PgBouncer's transaction mode
  // can route each query to a different backend connection, which breaks
  // session-scoped prepared statements (postgres-js's default) — every
  // query fails without this.
  const client = postgres(url, { max: 1, prepare: false });
  return drizzle(client, { schema });
}

let cached: ReturnType<typeof createDb> | undefined;

/** Lazily creates the DB client on first use, so importing this module never throws when DATABASE_URL is unset (e.g. during a build). */
export function getDb() {
  if (!cached) cached = createDb();
  return cached;
}
