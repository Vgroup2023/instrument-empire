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
  // max: 5 keeps each serverless function instance's connection footprint
  // small while still letting a handful of queries run concurrently — pages
  // like Insights and Chart of Accounts fire off many independent queries
  // per request (each report recomputes account balances from several
  // tables), and with max: 1 every one of those was forced through a single
  // connection one at a time, so their combined round-trip latency could add
  // up enough to trip Postgres's own statement_timeout. Pair this with your
  // provider's pooled connection string (e.g. Supabase's "Transaction
  // pooler" on port 6543) rather than a direct one.
  // prepare: false is required for that pooler: PgBouncer's transaction mode
  // can route each query to a different backend connection, which breaks
  // session-scoped prepared statements (postgres-js's default) — every
  // query fails without this. ssl: 'require' is needed because Supabase (and
  // most managed Postgres hosts) rejects unencrypted connections outright —
  // postgres-js doesn't enable TLS on its own unless the connection string
  // itself has a `sslmode` query param, which a copy-pasted Supabase
  // connection string won't have. connect_timeout fails fast on a stuck
  // connection attempt instead of hanging indefinitely. It is kept well under
  // Netlify's 10 second limit on a page render: at 10 seconds an unreachable
  // database used the whole budget, and a page that waited twice for it was
  // killed by the host with an "Inactivity Timeout" instead of showing an error.
  const client = postgres(url, { max: 5, prepare: false, ssl: 'require', connect_timeout: 3 });
  return drizzle(client, { schema });
}

let cached: ReturnType<typeof createDb> | undefined;

/** Lazily creates the DB client on first use, so importing this module never throws when DATABASE_URL is unset (e.g. during a build). */
export function getDb() {
  if (!cached) cached = createDb();
  return cached;
}
