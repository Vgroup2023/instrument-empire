import { cache } from 'react';
import { readSessionClaims } from '@/lib/session';
import { countUsers, getUser } from './service';
import { effectiveDepartments, type DepartmentKey, type Principal, type RoleKey } from './permissions';

export interface SessionUser extends Principal {
  /** Null for a shared-passphrase session. */
  id: string | null;
  name: string;
  email: string | null;
  /** True for the shared passphrase, which only works while nobody has an account (or when PASSPHRASE_LOGIN=on). */
  legacy: boolean;
}

/**
 * May the shared passphrase still be used? Only before the first account exists, or when switched on explicitly.
 * Read fresh each time: pages and routes can run as separate copies of this module, so a cached answer could go stale
 * (for example showing the passphrase form right after the first account was made). It is one count on a tiny table.
 */
export async function legacyAllowed(): Promise<{ allowed: boolean; anyUsers: boolean }> {
  const anyUsers = (await countUsers().catch(() => 0)) > 0;
  return { allowed: process.env.PASSPHRASE_LOGIN === 'on' || !anyUsers, anyUsers };
}

/** Kept so callers can say "the account situation just changed"; nothing is cached any more. */
export function resetLegacyMemo() {}

/**
 * Who is signed in on this request, read fresh from the database so a disabled account or a changed role takes effect
 * at once. Null means nobody (or a session that no longer counts).
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const claims = await readSessionClaims().catch(() => null);
  if (!claims) return null;
  if (claims.uid) {
    const u = await getUser(claims.uid);
    if (!u || u.status !== 'active' || u.sessionVersion !== claims.sv) return null;
    return { id: u.id, name: u.name, email: u.email, role: u.role, departments: u.departments, legacy: false };
  }
  const { allowed, anyUsers } = await legacyAllowed();
  if (!allowed) return null;
  // Before anyone has an account the shared passphrase is the owner; if it was left switched on afterwards it is an admin.
  const role: RoleKey = anyUsers ? 'admin' : 'owner';
  return { id: null, name: 'Office team', email: null, role, departments: [], legacy: true };
});

export function allowedDepartments(u: Principal): DepartmentKey[] {
  return effectiveDepartments(u);
}
