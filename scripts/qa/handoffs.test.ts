// Tests for team hand-offs: who sees which task, completing, and the once-only system tasks.
// Run: npx tsx scripts/qa/handoffs.test.ts   (needs DATABASE_URL pointing at a migrated database)
import assert from 'node:assert/strict';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('handoffs: ok (nothing to check without a database; set DATABASE_URL)');
    return;
  }
  const tasks = await import('../../src/lib/team/tasks');
  const { getDb } = await import('../../src/db/client');
  const { teamTasks } = await import('../../src/db/schema');
  const { eq, like } = await import('drizzle-orm');
  const db = getDb();
  await db.delete(teamTasks).where(like(teamTasks.title, 'QA %'));

  const sales = { id: null, name: 'Sam Sales', role: 'member' as const, departments: ['sales' as const] };
  const fin = { id: null, name: 'Fiona Finance', role: 'member' as const, departments: ['finance' as const] };
  const viewer = { id: null, name: 'Vic', role: 'viewer' as const, departments: ['finance' as const] };
  const admin = { id: null, name: 'Ada', role: 'admin' as const, departments: [] };

  await assert.rejects(() => tasks.createTask(sales, { title: 'QA nobody' }), /department or a person/);
  await assert.rejects(() => tasks.createTask(sales, { title: '', toDepartment: 'finance' }));
  await assert.rejects(() => tasks.createTask(sales, { title: 'QA bad dept', toDepartment: 'cooking' }));

  const t = await tasks.createTask(sales, { title: 'QA send the contract', toDepartment: 'finance', detail: 'ASAP', dueDate: '2030-01-31' });
  assert.equal(t.status, 'open');
  assert.equal(t.fromName, 'Sam Sales');
  assert.equal(t.dueDate, '2030-01-31');

  const has = async (v: Parameters<typeof tasks.listTasks>[0], box: 'inbox' | 'sent' | 'done') => (await tasks.listTasks(v, box)).some((x) => x.id === t.id);
  assert.ok(await has(fin, 'inbox'), 'finance sees it');
  assert.ok(await has(admin, 'inbox'), 'admin sees every department');
  assert.ok(!(await has(sales, 'inbox')), 'the sender is not the recipient');
  assert.ok((await tasks.countOpen(fin)) >= 1);

  await assert.rejects(() => tasks.setTaskStatus({ ...sales, name: 'Sam' }, 'not-a-uuid', 'done'));
  const other = { id: null, name: 'Pat People', role: 'member' as const, departments: ['people' as const] };
  await assert.rejects(() => tasks.setTaskStatus(other, t.id, 'done'), /not yours/);
  const done = await tasks.setTaskStatus(fin, t.id, 'done');
  assert.equal(done.status, 'done');
  assert.equal(done.doneByName, 'Fiona Finance');
  assert.ok(!(await has(fin, 'inbox')) && (await has(fin, 'done')));
  const reopened = await tasks.setTaskStatus(fin, t.id, 'open');
  assert.equal(reopened.status, 'open');
  assert.equal(reopened.doneAt, null);
  void viewer;

  // system tasks happen once per source
  const source = `qa-source-${Date.now()}`;
  const mk = () => tasks.createSystemTask(db, { source, title: 'QA system task', toDepartment: 'operations', fromName: 'CRM' });
  await mk();
  await mk();
  const rows = await db.select().from(teamTasks).where(eq(teamTasks.source, source));
  assert.equal(rows.length, 1);

  await db.delete(teamTasks).where(like(teamTasks.title, 'QA %'));
  console.log('handoffs: ok');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
