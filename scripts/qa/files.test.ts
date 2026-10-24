// Checks for the Files library's pure parts. Run: npx tsx scripts/qa/files.test.ts
import assert from 'node:assert/strict';
import { extOf, fileKind, formatBytes, MAX_DATABASE_FILE_BYTES, MAX_FILE_BYTES } from '../../src/lib/files/types';
import { storageConfigured, supabaseUrl } from '../../src/lib/files/storage';

// the extension decides the type, case does not matter
assert.equal(extOf('Report.FINAL.PDF'), 'pdf');
assert.equal(extOf('noextension'), '');
assert.equal(extOf('.hidden'), '');
assert.equal(fileKind('scan.JPG')?.type, 'image/jpeg');
assert.equal(fileKind('sheet.xlsx')?.group, 'data');
assert.equal(fileKind('brief.docx')?.group, 'office');
// anything that can run in a browser is refused
for (const bad of ['page.html', 'logo.svg', 'run.js', 'tool.exe', 'archive.zip', 'x.php', 'noext', 'a.pdf.html']) assert.equal(fileKind(bad), null, bad);
assert.equal(fileKind('a.html.pdf')?.type, 'application/pdf');

assert.equal(formatBytes(512), '512 B');
assert.equal(formatBytes(2048), '2 KB');
assert.equal(formatBytes(5 * 1024 * 1024), '5 MB');
assert.ok(MAX_DATABASE_FILE_BYTES < MAX_FILE_BYTES);

// the project address comes from the connection string, or an explicit setting
const keep = { url: process.env.DATABASE_URL, sb: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.DATABASE_URL = 'postgresql://postgres.oswfhemplnxengfodppb:secret@aws-0-ca-central-1.pooler.supabase.com:6543/postgres';
assert.equal(supabaseUrl(), 'https://oswfhemplnxengfodppb.supabase.co');
process.env.DATABASE_URL = 'postgresql://postgres:secret@db.abcdefghij1234.supabase.co:5432/postgres';
assert.equal(supabaseUrl(), 'https://abcdefghij1234.supabase.co');
process.env.DATABASE_URL = 'postgresql://user:pw@localhost:5432/app';
assert.equal(supabaseUrl(), null);
process.env.SUPABASE_URL = 'https://files.example.com/';
assert.equal(supabaseUrl(), 'https://files.example.com');
// storage is on only when the service key is present too
assert.equal(storageConfigured(), false);
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
assert.equal(storageConfigured(), true);
for (const [k, v] of [['DATABASE_URL', keep.url], ['SUPABASE_URL', keep.sb], ['SUPABASE_SERVICE_ROLE_KEY', keep.key]] as const) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}
console.log('files library: ok');
