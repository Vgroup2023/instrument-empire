// Applies pending drizzle migrations and prints the real error if one fails
// (drizzle-kit migrate swallows it). Used by the "Run database migrations" workflow.
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 1, ssl: 'require', prepare: false, connect_timeout: 15 });
  try {
    const tables = await client`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    console.log(`public tables (${tables.length}):`, tables.map((t) => t.table_name).join(', ') || '(none)');
    const hist = await client`select to_regclass('drizzle.__drizzle_migrations')::text as t`;
    if (hist[0]?.t) {
      const n = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
      console.log(`migrations already recorded: ${n[0].n}`);
    } else {
      console.log('migrations already recorded: none (no drizzle.__drizzle_migrations table)');
    }
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
