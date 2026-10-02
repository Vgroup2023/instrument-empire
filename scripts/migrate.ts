// Applies pending drizzle migrations and prints the real error if one fails
// (drizzle-kit migrate swallows it). Used by the "Run database migrations" workflow.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

type Sql = postgres.Sql;

// Databases first built outside drizzle (e.g. drizzle-kit push) have the older
// tables but no migration history, so replaying 0000 fails with "already exists".
// When that is the case, verify the old objects really are there, then record
// the migrations up to BASELINE_TAG as applied without running them.
const BASELINE_TAG = '0006_faulty_psylocke';

async function baselineIfNeeded(client: Sql) {
  const hist = await client`select to_regclass('drizzle.__drizzle_migrations')::text as t`;
  if (hist[0]?.t) {
    const n = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
    console.log(`migrations already recorded: ${n[0].n}`);
    if (n[0].n > 0) return;
  } else {
    console.log('migrations already recorded: none');
  }
  const vendors = await client`select to_regclass('public.vendors')::text as t`;
  if (!vendors[0]?.t) return; // empty database: let the normal migrator build everything

  const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  const upTo = journal.entries.findIndex((e) => e.tag === BASELINE_TAG);
  if (upTo < 0) throw new Error(`baseline tag ${BASELINE_TAG} not in journal`);
  const baseline = journal.entries.slice(0, upTo + 1);

  const missing: string[] = [];
  for (const e of baseline) {
    const sql = readFileSync(`./drizzle/${e.tag}.sql`, 'utf8');
    for (const m of sql.matchAll(/CREATE TABLE "([^"]+)"/g)) {
      const r = await client`select to_regclass(${'public.' + m[1]})::text as t`;
      if (!r[0]?.t) missing.push(`table ${m[1]} (${e.tag})`);
    }
    for (const m of sql.matchAll(/CREATE TYPE "public"\."([^"]+)"/g)) {
      const r = await client`select 1 from pg_type where typname = ${m[1]}`;
      if (!r.length) missing.push(`type ${m[1]} (${e.tag})`);
    }
    for (const m of sql.matchAll(/ALTER TABLE "([^"]+)" ADD COLUMN "([^"]+)"/g)) {
      const r = await client`select 1 from information_schema.columns where table_schema = 'public' and table_name = ${m[1]} and column_name = ${m[2]}`;
      if (!r.length) missing.push(`column ${m[1]}.${m[2]} (${e.tag})`);
    }
  }
  if (missing.length) {
    throw new Error(`Database does not match migrations up to ${BASELINE_TAG}; refusing to baseline. Missing: ${missing.join(', ')}`);
  }

  await client`create schema if not exists drizzle`;
  await client`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
  for (const e of baseline) {
    const hash = createHash('sha256').update(readFileSync(`./drizzle/${e.tag}.sql`, 'utf8')).digest('hex');
    await client`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hash}, ${e.when})`;
  }
  console.log(`Existing database verified; recorded ${baseline.length} migrations as already applied (through ${BASELINE_TAG}).`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 1, ssl: 'require', prepare: false, connect_timeout: 15 });
  try {
    const tables = await client`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    console.log(`public tables (${tables.length}):`, tables.map((t) => t.table_name).join(', ') || '(none)');
    await baselineIfNeeded(client);
    await migrate(drizzle(client), { migrationsFolder: './drizzle' });
    console.log('Migrations applied.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('Migration failed:', err?.message ?? err);
  if (err?.cause) console.error('Cause:', err.cause?.message ?? err.cause, err.cause?.code ?? '');
  if (err?.code) console.error('Code:', err.code, err.detail ?? '');
  process.exit(1);
});
