import { getDb } from '@/db/client';
import { auditLog } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

// A change-history trail for month-end/audit review — what changed, the
// before/after snapshot, and when. This app has a single shared login (no
// individual user accounts), so this deliberately doesn't try to record
// "who" made a change — only "what" and "when". Recording is best-effort:
// a logging failure never blocks the underlying save, since a missed audit
// row is far less harmful than losing a legitimate edit.

export type AuditEntityType = 'journal_entry' | 'account';
export type AuditAction = 'create' | 'update' | 'delete';

export interface AuditLogEntry {
  Id: string;
  EntityType: AuditEntityType;
  EntityId: string;
  Action: AuditAction;
  Before: unknown;
  After: unknown;
  CreatedAt: string;
}

export interface RecordAuditLogInput {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
}

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLog).values({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: input.before ?? null,
      after: input.after ?? null,
    });
  } catch {
    // Best-effort — never let audit logging block or fail the actual save.
  }
}

const LIST_LIMIT = 200;

export async function listAuditLog(entityType?: AuditEntityType): Promise<AuditLogEntry[]> {
  const db = getDb();
  const rows = entityType
    ? await db.select().from(auditLog).where(eq(auditLog.entityType, entityType)).orderBy(desc(auditLog.createdAt)).limit(LIST_LIMIT)
    : await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(LIST_LIMIT);
  return rows.map((row) => ({
    Id: row.id,
    EntityType: row.entityType,
    EntityId: row.entityId,
    Action: row.action,
    Before: row.before,
    After: row.after,
    CreatedAt: row.createdAt.toISOString(),
  }));
}
