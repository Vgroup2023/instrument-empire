import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { appUsers, teamTasks } from '@/db/schema';
import { ConflictError, NotFoundError, ValidationError, asRecord, oneOf, optIsoDate, optText, optUuid, text } from '@/lib/validation';
import { DEPARTMENT_KEYS, effectiveDepartments, type DepartmentKey, type Principal } from '@/lib/auth/permissions';

export interface TeamTask {
  id: string;
  title: string;
  detail: string | null;
  fromName: string;
  toDepartment: DepartmentKey | null;
  toUserId: string | null;
  toUserName: string | null;
  status: 'open' | 'done' | 'dismissed';
  href: string | null;
  dueDate: string | null;
  doneAt: string | null;
  doneByName: string | null;
  createdAt: string;
}

/** Who is looking: their id (null for the shared passphrase) and what they may see. */
export type Viewer = Principal & { id?: string | null; name?: string };

type Row = typeof teamTasks.$inferSelect;
const toTask = (r: Row, userName: string | null): TeamTask => ({
  id: r.id, title: r.title, detail: r.detail, fromName: r.fromName,
  toDepartment: (DEPARTMENT_KEYS as string[]).includes(r.toDepartment ?? '') ? (r.toDepartment as DepartmentKey) : null,
  toUserId: r.toUserId, toUserName: userName, status: r.status as TeamTask['status'], href: r.href, dueDate: r.dueDate,
  doneAt: r.doneAt ? r.doneAt.toISOString() : null, doneByName: r.doneByName, createdAt: r.createdAt.toISOString(),
});

async function withNames(rows: Row[]): Promise<TeamTask[]> {
  const ids = [...new Set(rows.map((r) => r.toUserId).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) for (const u of await getDb().select({ id: appUsers.id, name: appUsers.name }).from(appUsers).where(inArray(appUsers.id, ids))) names.set(u.id, u.name);
  return rows.map((r) => toTask(r, r.toUserId ? (names.get(r.toUserId) ?? null) : null));
}

/** The tasks that are "for" this person: addressed to them, or to a department they work in and not to someone else. */
function forMe(v: Viewer): SQL {
  const depts = effectiveDepartments(v);
  const byDept = depts.length ? and(isNull(teamTasks.toUserId), inArray(teamTasks.toDepartment, depts)) : sql`false`;
  return v.id ? (or(eq(teamTasks.toUserId, v.id), byDept) as SQL) : (byDept as SQL);
}

export async function listTasks(v: Viewer, box: 'inbox' | 'sent' | 'done'): Promise<TeamTask[]> {
  const db = getDb();
  let where: SQL;
  if (box === 'inbox') where = and(eq(teamTasks.status, 'open'), forMe(v)) as SQL;
  else if (box === 'done') where = and(inArray(teamTasks.status, ['done', 'dismissed']), forMe(v)) as SQL;
  else where = (v.id ? eq(teamTasks.fromUserId, v.id) : and(isNull(teamTasks.fromUserId), eq(teamTasks.fromName, v.name ?? 'Office team'))) as SQL;
  const rows = await db.select().from(teamTasks).where(where).orderBy(desc(teamTasks.createdAt)).limit(200);
  return withNames(rows);
}

export async function countOpen(v: Viewer): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(teamTasks).where(and(eq(teamTasks.status, 'open'), forMe(v)));
  return r.n;
}

/** A person hands work to a department or to one colleague. */
export async function createTask(actor: Viewer & { name: string }, input: unknown): Promise<TeamTask> {
  const raw = asRecord(input, 'The assignment');
  const title = text(raw.title, 'What needs doing', { max: 200 });
  const detail = optText(raw.detail, 'Details', 2000) ?? null;
  const toDepartment = raw.toDepartment ? oneOf(raw.toDepartment, 'Department', DEPARTMENT_KEYS) : null;
  const toUserId = optUuid(raw.toUserId, 'Person') ?? null;
  if (!toDepartment && !toUserId) throw new ValidationError('Choose a department or a person to hand this to.');
  const dueDate = optIsoDate(raw.dueDate, 'Due date') ?? null;
  const db = getDb();
  if (toUserId) {
    const [u] = await db.select({ status: appUsers.status }).from(appUsers).where(eq(appUsers.id, toUserId));
    if (!u || u.status === 'disabled') throw new ConflictError('That person cannot receive work right now.');
  }
  const [row] = await db.insert(teamTasks).values({ title, detail, fromUserId: actor.id ?? null, fromName: actor.name, toDepartment, toUserId, dueDate }).returning();
  return (await withNames([row]))[0];
}

type Ex = Pick<ReturnType<typeof getDb>, 'insert'>;

/**
 * Work the app hands over by itself (a won deal, for example). `source` makes it happen once: the same event again does
 * nothing. Safe to call inside the caller's transaction.
 */
export async function createSystemTask(ex: Ex, t: { source: string; title: string; detail?: string; toDepartment: DepartmentKey; href?: string; fromName: string }): Promise<void> {
  await ex.insert(teamTasks).values({ title: t.title, detail: t.detail ?? null, fromName: t.fromName, toDepartment: t.toDepartment, href: t.href ?? null, source: t.source }).onConflictDoNothing();
}

/** Mark a task done, dismissed, or open again. Only someone it is for, or who sent it, may. */
export async function setTaskStatus(v: Viewer & { name: string }, id: string, status: unknown): Promise<TeamTask> {
  const next = oneOf(status, 'Status', ['open', 'done', 'dismissed'] as const);
  const db = getDb();
  const [row] = await db.select().from(teamTasks).where(eq(teamTasks.id, id));
  if (!row) throw new NotFoundError('That task was not found.');
  const mine = row.fromUserId !== null && row.fromUserId === (v.id ?? null);
  const [visible] = await db.select({ id: teamTasks.id }).from(teamTasks).where(and(eq(teamTasks.id, id), forMe(v)));
  if (!mine && !visible) throw new ConflictError('That task is not yours to change.');
  const closing = next !== 'open';
  const [updated] = await db
    .update(teamTasks)
    .set({ status: next, doneAt: closing ? new Date() : null, doneByName: closing ? v.name : null, updatedAt: new Date() })
    .where(eq(teamTasks.id, id))
    .returning();
  return (await withNames([updated]))[0];
}
