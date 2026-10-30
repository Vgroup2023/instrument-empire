import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { appUserTokens, appUsers } from '@/db/schema';
import {
  ConflictError, NotFoundError, ValidationError, asRecord, oneOf, text, uuid,
} from '@/lib/validation';
import { hashPassword, hashToken, newToken, passwordProblem, verifyPassword } from './password';
import {
  DEPARTMENT_KEYS, ROLE_KEYS, canManageUser, type DepartmentKey, type Principal, type RoleKey,
} from './permissions';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: RoleKey;
  departments: DepartmentKey[];
  status: 'invited' | 'active' | 'disabled';
  sessionVersion: number;
  lastLoginAt: string | null;
  createdAt: string;
}

type Row = typeof appUsers.$inferSelect;
const toUser = (r: Row): AppUser => ({
  id: r.id, email: r.email, name: r.name, role: r.role as RoleKey,
  departments: (r.departments ?? []).filter((d): d is DepartmentKey => (DEPARTMENT_KEYS as string[]).includes(d)),
  status: r.status as AppUser['status'], sessionVersion: r.sessionVersion, lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});

export const INVITE_DAYS = 7;
const RESET_HOURS = 24;

export async function countUsers(): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(appUsers);
  return r.n;
}

export async function listUsers(): Promise<AppUser[]> {
  const rows = await getDb().select().from(appUsers).orderBy(asc(appUsers.name));
  return rows.map(toUser);
}

export async function getUser(id: string): Promise<AppUser | null> {
  const [r] = await getDb().select().from(appUsers).where(eq(appUsers.id, id));
  return r ? toUser(r) : null;
}

function emailOf(v: unknown): string {
  const e = text(v, 'Email', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ValidationError('Enter a valid email address.');
  return e;
}

function departmentsOf(v: unknown, role: RoleKey): DepartmentKey[] {
  if (role === 'owner' || role === 'admin') return [];
  if (!Array.isArray(v)) throw new ValidationError('Choose at least one department.');
  const out = [...new Set(v.map(String))];
  if (!out.every((d) => (DEPARTMENT_KEYS as string[]).includes(d))) throw new ValidationError('That department does not exist.');
  if (out.length === 0) throw new ValidationError('Choose at least one department.');
  return out as DepartmentKey[];
}

async function activeOwners(): Promise<number> {
  const [r] = await getDb().select({ n: sql<number>`count(*)::int` }).from(appUsers).where(and(eq(appUsers.role, 'owner'), eq(appUsers.status, 'active')));
  return r.n;
}

/** The very first account, made while nobody has one yet. It is the owner. */
export async function createFirstOwner(input: unknown): Promise<AppUser> {
  const raw = asRecord(input, 'The account');
  const email = emailOf(raw.email);
  const name = text(raw.name, 'Name', { max: 120 });
  const problem = passwordProblem(raw.password, email);
  if (problem) throw new ValidationError(problem);
  const hash = await hashPassword(raw.password as string);
  return getDb().transaction(async (tx) => {
    // Two people finishing setup at once: only the first gets in.
    await tx.execute(sql`select pg_advisory_xact_lock(7440011)`);
    const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(appUsers);
    if (n.n > 0) throw new ConflictError('Accounts already exist. Sign in with your own account.');
    const [row] = await tx.insert(appUsers).values({ email, name, passwordHash: hash, role: 'owner', departments: [], status: 'active', lastLoginAt: new Date() }).returning();
    return toUser(row);
  });
}

export interface LinkResult {
  user: AppUser;
  /** The one-time token for the link. Shown once; only its hash is kept. */
  token: string;
  kind: 'invite' | 'reset';
  expiresAt: string;
}

async function issueToken(userId: string, kind: 'invite' | 'reset'): Promise<{ token: string; expiresAt: Date }> {
  const { token, hash } = newToken();
  const expiresAt = new Date(Date.now() + (kind === 'invite' ? INVITE_DAYS * 86_400_000 : RESET_HOURS * 3_600_000));
  const db = getDb();
  // One live link per person: a new one replaces any older unused one.
  await db.delete(appUserTokens).where(and(eq(appUserTokens.userId, userId), isNull(appUserTokens.usedAt)));
  await db.insert(appUserTokens).values({ userId, tokenHash: hash, kind, expiresAt });
  return { token, expiresAt };
}

/** Adds a person and makes their invitation link. */
export async function inviteUser(actor: Principal & { name: string }, input: unknown): Promise<LinkResult> {
  const raw = asRecord(input, 'The invitation');
  const email = emailOf(raw.email);
  const name = text(raw.name, 'Name', { max: 120 });
  const role = oneOf(raw.role, 'Role', ROLE_KEYS);
  const departments = departmentsOf(raw.departments, role);
  if (!canManageUser(actor, null, { role, departments })) throw new ConflictError('You can not add someone with that role or in those departments.');
  const db = getDb();
  const [clash] = await db.select({ id: appUsers.id }).from(appUsers).where(sql`lower(${appUsers.email}) = ${email}`);
  if (clash) throw new ConflictError('Someone with that email already has an account.');
  const [row] = await db.insert(appUsers).values({ email, name, role, departments, status: 'invited', invitedBy: actor.name }).returning();
  const { token, expiresAt } = await issueToken(row.id, 'invite');
  return { user: toUser(row), token, kind: 'invite', expiresAt: expiresAt.toISOString() };
}

/** Changes someone's name, role, departments or whether they can sign in. */
export async function updateUser(actor: Principal & { id?: string | null }, id: string, input: unknown): Promise<AppUser> {
  uuid(id, 'Person');
  const raw = asRecord(input, 'The change');
  const db = getDb();
  const [before] = await db.select().from(appUsers).where(eq(appUsers.id, id));
  if (!before) throw new NotFoundError('That person was not found.');
  const cur = toUser(before);
  const role = raw.role === undefined ? cur.role : oneOf(raw.role, 'Role', ROLE_KEYS);
  const departments = raw.departments === undefined && (role === cur.role) ? cur.departments : departmentsOf(raw.departments ?? cur.departments, role);
  const status = raw.status === undefined ? cur.status : oneOf(raw.status, 'Status', ['active', 'disabled'] as const);
  const name = raw.name === undefined ? cur.name : text(raw.name, 'Name', { max: 120 });
  const touchesAccess = role !== cur.role || status !== cur.status || departments.join() !== cur.departments.join();
  if (touchesAccess && !canManageUser(actor, { role: cur.role, departments: cur.departments, isSelf: actor.id === id }, { role, departments })) {
    throw new ConflictError(actor.id === id ? 'You can not change your own role or access.' : 'You can not change that person.');
  }
  if (cur.role === 'owner' && (role !== 'owner' || status === 'disabled') && (await activeOwners()) <= 1) throw new ConflictError('There must always be at least one active owner.');
  if (status === 'active' && !before.passwordHash) throw new ConflictError('They have not accepted their invitation yet.');
  const patch: Partial<typeof appUsers.$inferInsert> = { name, role, departments, updatedAt: new Date() };
  if (status !== cur.status) {
    patch.status = status;
    // Disabling or changing access signs them out everywhere (within about half a minute).
    patch.sessionVersion = cur.sessionVersion + 1;
  } else if (role !== cur.role || departments.join() !== cur.departments.join()) {
    patch.sessionVersion = cur.sessionVersion + 1;
  }
  const [row] = await db.update(appUsers).set(patch).where(eq(appUsers.id, id)).returning();
  return toUser(row);
}

/** Cancels an invitation that was never accepted. */
export async function removeInvitation(actor: Principal & { id?: string | null }, id: string): Promise<void> {
  uuid(id, 'Person');
  const db = getDb();
  const [row] = await db.select().from(appUsers).where(eq(appUsers.id, id));
  if (!row) throw new NotFoundError('That person was not found.');
  if (row.status !== 'invited') throw new ConflictError('Only an invitation that has not been accepted can be removed. Disable the account instead.');
  const cur = toUser(row);
  if (!canManageUser(actor, { role: cur.role, departments: cur.departments, isSelf: actor.id === id }, { role: cur.role, departments: cur.departments })) throw new ConflictError('You can not remove that invitation.');
  await db.delete(appUsers).where(eq(appUsers.id, id));
}

/** A fresh link for someone to set a new password, or to accept an invitation that expired. */
export async function issueLink(actor: Principal & { id?: string | null }, id: string): Promise<LinkResult> {
  uuid(id, 'Person');
  const db = getDb();
  const [row] = await db.select().from(appUsers).where(eq(appUsers.id, id));
  if (!row) throw new NotFoundError('That person was not found.');
  const cur = toUser(row);
  if (cur.status === 'disabled') throw new ConflictError('Turn the account back on first.');
  if (!canManageUser(actor, { role: cur.role, departments: cur.departments, isSelf: false }, { role: cur.role, departments: cur.departments })) throw new ConflictError('You can not do that for this person.');
  const kind = cur.status === 'invited' ? 'invite' : 'reset';
  const { token, expiresAt } = await issueToken(id, kind);
  return { user: cur, token, kind, expiresAt: expiresAt.toISOString() };
}

/** What a link is for, without using it up. Null if it is wrong, used or expired. */
export async function peekToken(token: string): Promise<{ email: string; name: string; kind: 'invite' | 'reset' } | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const [r] = await getDb()
    .select({ email: appUsers.email, name: appUsers.name, kind: appUserTokens.kind, status: appUsers.status })
    .from(appUserTokens)
    .innerJoin(appUsers, eq(appUsers.id, appUserTokens.userId))
    .where(and(eq(appUserTokens.tokenHash, hashToken(token)), isNull(appUserTokens.usedAt), gt(appUserTokens.expiresAt, new Date())));
  if (!r || r.status === 'disabled') return null;
  return { email: r.email, name: r.name, kind: r.kind as 'invite' | 'reset' };
}

/** Uses a link: sets the password and activates the account. Returns the signed-in person. */
export async function acceptToken(token: string, password: unknown): Promise<AppUser> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new ValidationError('This link is not valid.');
  const hash = hashToken(token);
  const db = getDb();
  const [found] = await db
    .select({ tokenId: appUserTokens.id, user: appUsers })
    .from(appUserTokens)
    .innerJoin(appUsers, eq(appUsers.id, appUserTokens.userId))
    .where(and(eq(appUserTokens.tokenHash, hash), isNull(appUserTokens.usedAt), gt(appUserTokens.expiresAt, new Date())));
  if (!found || found.user.status === 'disabled') throw new ValidationError('This link has expired or was already used. Ask for a new one.');
  const problem = passwordProblem(password, found.user.email);
  if (problem) throw new ValidationError(problem);
  const pw = await hashPassword(password as string);
  return db.transaction(async (tx) => {
    // Claim the link first so two clicks at once can not both use it.
    const [claimed] = await tx.update(appUserTokens).set({ usedAt: new Date() }).where(and(eq(appUserTokens.id, found.tokenId), isNull(appUserTokens.usedAt))).returning({ id: appUserTokens.id });
    if (!claimed) throw new ValidationError('This link was already used.');
    const [row] = await tx
      .update(appUsers)
      .set({ passwordHash: pw, status: 'active', sessionVersion: found.user.sessionVersion + 1, lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(appUsers.id, found.user.id))
      .returning();
    return toUser(row);
  });
}

/** Checks an email and password. Returns the person, or null (the same for a wrong email, a wrong password and a disabled account). */
export async function authenticate(emailRaw: unknown, password: unknown): Promise<AppUser | null> {
  if (typeof emailRaw !== 'string' || typeof password !== 'string' || password.length > 200) return null;
  const email = emailRaw.trim().toLowerCase();
  const [row] = await getDb().select().from(appUsers).where(sql`lower(${appUsers.email}) = ${email}`);
  const ok = await verifyPassword(password, row?.passwordHash);
  if (!row || !ok || row.status !== 'active') return null;
  const [fresh] = await getDb().update(appUsers).set({ lastLoginAt: new Date() }).where(eq(appUsers.id, row.id)).returning();
  return toUser(fresh);
}

export async function changeOwnPassword(userId: string, current: unknown, next: unknown): Promise<AppUser> {
  const db = getDb();
  const [row] = await db.select().from(appUsers).where(eq(appUsers.id, userId));
  if (!row || row.status !== 'active') throw new NotFoundError('Account not found.');
  if (typeof current !== 'string' || !(await verifyPassword(current, row.passwordHash))) throw new ValidationError('Your current password is not right.');
  const problem = passwordProblem(next, row.email);
  if (problem) throw new ValidationError(problem);
  const [updated] = await db.update(appUsers).set({ passwordHash: await hashPassword(next as string), sessionVersion: row.sessionVersion + 1, updatedAt: new Date() }).where(eq(appUsers.id, userId)).returning();
  return toUser(updated);
}

