// Refreshes the official tariff (USITC HTS) and the Consolidated Screening List
// in the database. Needs DATABASE_URL. Usage: npm run refdata:sync [hts|csl]
import { syncHts, syncScreeningList } from '../src/lib/refdata/sync';

async function main() {
  const want = process.argv[2] ?? 'all';
  let failed = false;
  for (const [name, fn] of [['hts', syncHts], ['csl', syncScreeningList]] as const) {
    if (want !== 'all' && want !== name) continue;
    try {
      const r = await fn();
      console.log(`${name}: ${r.rows} rows`);
    } catch (err) {
      failed = true;
      console.error(`${name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
main();
