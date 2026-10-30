// Who may open which page and call which endpoint. Pure rules (no database, no cookies), so the sign-in gate, the menu, the
// server pages and the tests all give the same answer.

export const DEPARTMENTS = [
  { key: 'finance', name: 'Finance & accounting', blurb: 'Invoices, bills, the books, reports, tax' },
  { key: 'sales', name: 'Sales & CRM', blurb: 'Leads, deals, customers, estimates, quotes' },
  { key: 'operations', name: 'Operations & logistics', blurb: 'Orders, shipments, agents, customs' },
  { key: 'people', name: 'People & payroll', blurb: 'Time and attendance, scheduling, payroll' },
  { key: 'admin', name: 'Administration & legal', blurb: 'Settings, Counsel (AI lawyer)' },
] as const;
export type DepartmentKey = (typeof DEPARTMENTS)[number]['key'];
export const DEPARTMENT_KEYS = DEPARTMENTS.map((d) => d.key) as DepartmentKey[];

export const ROLES = [
  { key: 'owner', name: 'Owner', blurb: 'Everything, including managing the owner accounts' },
  { key: 'admin', name: 'Admin', blurb: 'Everything, and manages everyone except owners' },
  { key: 'manager', name: 'Department manager', blurb: 'Full access to their departments and manages the people in them' },
  { key: 'member', name: 'Team member', blurb: 'Full access to their departments' },
  { key: 'viewer', name: 'View only', blurb: 'Can look at their departments but not change anything' },
] as const;
export type RoleKey = (typeof ROLES)[number]['key'];
export const ROLE_KEYS = ROLES.map((r) => r.key) as RoleKey[];

/** The part of a session the rules need. A shared-passphrase session (before accounts exist) counts as an owner. */
export interface Principal {
  role: RoleKey;
  departments: DepartmentKey[];
}

type Need = 'all' | 'manage' | readonly DepartmentKey[];
const F = ['finance'] as const;
const FS = ['finance', 'sales'] as const;
const FSO = ['finance', 'sales', 'operations'] as const;
const SO = ['sales', 'operations'] as const;

/**
 * What each page and endpoint needs: 'all' (anyone signed in), 'manage' (owners, admins and department managers),
 * or one or more departments (membership in any one is enough). The longest matching prefix wins. Anything not
 * listed here is closed to everyone except owners and admins, so a new page is private until it is listed.
 */
const RULES: [string, Need][] = [
  ['/dashboard', 'all'],
  ['/dashboard/guide', 'all'],
  ['/install', 'all'],
  ['/dashboard/files', 'all'],
  ['/dashboard/account', 'all'],
  ['/dashboard/inbox', 'all'],
  ['/dashboard/team', 'manage'],
  ['/dashboard/settings', ['admin']],
  ['/dashboard/counsel', ['admin']],
  ['/dashboard/orders', ['operations']],
  ['/dashboard/operations', ['operations']],
  ['/dashboard/shipments', ['operations']],
  ['/dashboard/agents', ['operations']],
  ['/dashboard/rfqs', SO],
  ['/dashboard/quoting-rules', SO],
  ['/dashboard/crm', ['sales']],
  ['/dashboard/invoices', FS],
  ['/dashboard/estimates', FS],
  ['/dashboard/customers', FSO],
  ['/dashboard/products', FSO],
  ['/dashboard/sales', FS],
  ['/dashboard/ar-ap', FS],
  ['/dashboard/capital', F],
  ['/dashboard/payments', F],
  ['/dashboard/vendors', F],
  ['/dashboard/bills', F],
  ['/dashboard/bookkeeping', F],
  ['/dashboard/accounts', F],
  ['/dashboard/journal-entries', F],
  ['/dashboard/audit-log', F],
  ['/dashboard/expenses', F],
  ['/dashboard/transfers', F],
  ['/dashboard/reconciliation', F],
  ['/dashboard/tax', F],
  ['/dashboard/anomalies', F],
  ['/dashboard/flux-analysis', F],
  ['/dashboard/time', ['people']],
  ['/dashboard/schedule', ['people']],
  ['/dashboard/pbj', ['people']],
  ['/dashboard/pay-runs', ['people']],
  ['/dashboard/payroll', ['people']],

  ['/api/team', 'manage'],
  ['/api/auth', 'all'],
  ['/api/tasks', 'all'],
  ['/api/options', 'all'],
  ['/api/files', 'all'],
  ['/api/documents', 'all'],
  ['/api/guide', 'all'],
  ['/api/dashboard', 'all'],
  ['/api/currencies', 'all'],
  ['/api/counsel', ['admin']],
  ['/api/crm', ['sales']],
  ['/api/invoices', FS],
  ['/api/estimates', FS],
  ['/api/customers', FSO],
  ['/api/products', FSO],
  ['/api/payments', F],
  ['/api/vendors', F],
  ['/api/bills', F],
  ['/api/bookkeeping', F],
  ['/api/accounts', F],
  ['/api/journal-entries', F],
  ['/api/expenses', F],
  ['/api/transfers', F],
  ['/api/reconciliation', F],
  ['/api/tax', F],
  ['/api/orders', ['operations']],
  ['/api/shipments', ['operations']],
  ['/api/desk', ['operations']],
  ['/api/agents', ['operations']],
  ['/api/restricted-parties', ['operations']],
  ['/api/refdata', ['operations']],
  ['/api/rfqs', SO],
  ['/api/quoting', SO],
  ['/api/workforce', ['people']],
  ['/api/pay-runs', ['people']],
  ['/api/payroll', ['people']],
].sort((a, b) => b[0].length - a[0].length) as [string, Need][];

export function needFor(pathname: string): Need | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  for (const [prefix, need] of RULES) {
    if (path === prefix || (prefix !== '/dashboard' && path.startsWith(`${prefix}/`))) return need;
  }
  return null;
}

const READ_ONLY = new Set(['GET', 'HEAD', 'OPTIONS']);
export const isOwnerOrAdmin = (p: Principal) => p.role === 'owner' || p.role === 'admin';

/** May this person open this page or call this endpoint with this method? */
export function canAccess(p: Principal, pathname: string, method = 'GET'): boolean {
  if (isOwnerOrAdmin(p)) return true;
  if (p.role === 'viewer' && !READ_ONLY.has(method.toUpperCase())) return false;
  const need = needFor(pathname);
  if (need === null) return false;
  if (need === 'all') return true;
  if (need === 'manage') return p.role === 'manager';
  return need.some((d) => p.departments.includes(d));
}

/** The departments a person may work in: everything for owners and admins, otherwise their own. */
export function effectiveDepartments(p: Principal): DepartmentKey[] {
  return isOwnerOrAdmin(p) ? [...DEPARTMENT_KEYS] : p.departments;
}

export interface Target {
  role: RoleKey;
  departments: DepartmentKey[];
  isSelf: boolean;
}

/**
 * May `actor` create or change a person to this role and these departments? Owners may do anything, admins anything
 * except touch an owner, department managers only members and viewers inside departments they belong to.
 * Nobody changes their own role or access (it would be a way to lock yourself out or promote yourself).
 */
export function canManageUser(actor: Principal, current: Target | null, next: { role: RoleKey; departments: DepartmentKey[] }): boolean {
  if (current?.isSelf) return false;
  if (actor.role === 'owner') return true;
  if (actor.role === 'admin') return next.role !== 'owner' && current?.role !== 'owner';
  if (actor.role === 'manager') {
    const own = new Set(actor.departments);
    const rank = (r: RoleKey) => r === 'member' || r === 'viewer';
    if (!rank(next.role) || (current && !rank(current.role))) return false;
    if (next.departments.length === 0 || !next.departments.every((d) => own.has(d))) return false;
    if (current && !current.departments.every((d) => own.has(d))) return false;
    return true;
  }
  return false;
}

export function roleName(role: string): string {
  return ROLES.find((r) => r.key === role)?.name ?? role;
}
export function departmentName(key: string): string {
  return DEPARTMENTS.find((d) => d.key === key)?.name ?? key;
}
