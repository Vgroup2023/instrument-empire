// Fails if a dashboard page exists that the navigation (and so the master
// dashboard) doesn't list, or the navigation lists a page that doesn't exist.
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const root = 'src/app/dashboard';
const pages = new Set(['/dashboard']);
for (const e of readdirSync(root, { withFileTypes: true })) {
  if (e.isDirectory() && existsSync(`${root}/${e.name}/page.tsx`)) pages.add(`/dashboard/${e.name}`);
}
const nav = readFileSync('src/components/layout/navGroups.ts', 'utf8');
const listed = new Set([...nav.matchAll(/href: '([^']+)'/g)].map((m) => m[1]));

const missing = [...pages].filter((p) => !listed.has(p));
const dead = [...listed].filter((h) => h.startsWith('/dashboard') && !pages.has(h));
const nonDashboard = [...listed].filter((h) => !h.startsWith('/dashboard') && !existsSync(`src/app${h}/page.tsx`));
if (missing.length || dead.length || nonDashboard.length) {
  if (missing.length) console.error(`Pages missing from navGroups.ts: ${missing.join(', ')}`);
  if (dead.length) console.error(`navGroups.ts links to pages that don't exist: ${dead.join(', ')}`);
  if (nonDashboard.length) console.error(`navGroups.ts links to missing pages: ${nonDashboard.join(', ')}`);
  process.exit(1);
}
console.log(`Navigation covers all ${pages.size} dashboard pages.`);
