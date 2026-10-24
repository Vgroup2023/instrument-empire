import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/db/client';
import { files } from '@/db/schema';
import { NotFoundError, ValidationError, asRecord, optText, text, uuid } from '@/lib/validation';
import { containsMatch } from '@/lib/optionSearch';
import { FILE_TYPES, MAX_DATABASE_FILE_BYTES, MAX_FILE_BYTES, extOf, fileKind, type FileRow } from './types';
import { createDownloadUrl, createUploadUrl, objectSize, removeObject, storageConfigured } from './storage';

// The Files library: upload, list, rename, download and delete. Only metadata is queried for lists, so the tab stays
// quick however many files there are, and the bytes go straight between the browser and object storage.

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const STALE_PENDING_MS = 24 * 60 * 60 * 1000;
export const PAGE = 30;

const toRow = (r: Pick<typeof files.$inferSelect, 'id' | 'name' | 'contentType' | 'size' | 'label' | 'createdAt'>): FileRow => ({
  id: r.id,
  name: r.name,
  contentType: r.contentType,
  size: r.size,
  label: r.label,
  createdAt: r.createdAt.toISOString(),
});

export function filesMode(): 'storage' | 'database' {
  return storageConfigured() ? 'storage' : 'database';
}

/** Uploads that were started but never finished leave an unusable row behind; clear the old ones. */
async function purgeStale(): Promise<void> {
  const db = getDb();
  const stale = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(and(eq(files.status, 'pending'), lt(files.createdAt, new Date(Date.now() - STALE_PENDING_MS))))
    .limit(50);
  for (const f of stale) {
    if (f.storageKey) await removeObject(f.storageKey).catch(() => {});
    await db.delete(files).where(eq(files.id, f.id));
  }
}

export interface UploadStart {
  file: FileRow;
  /** Present with object storage: the browser PUTs the file here. */
  uploadUrl?: string;
}

export async function startUpload(raw: unknown): Promise<UploadStart> {
  const b = asRecord(raw, 'The upload');
  const name = text(b.name, 'File name', { max: 200 }).replace(/[\\/\u0000-\u001f]/g, '_');
  const kind = fileKind(name);
  if (!kind) throw new ValidationError('That kind of file is not accepted. Use a PDF, photo, Word, Excel, PowerPoint, CSV or text file.');
  const label = optText(b.label, 'Label', 60) ?? null;
  const mode = filesMode();
  void purgeStale().catch(() => {});
  const db = getDb();

  if (mode === 'database') {
    const data = typeof b.contentBase64 === 'string' ? b.contentBase64 : '';
    if (!data) throw new ValidationError('A file is required.');
    const size = Math.floor((data.length * 3) / 4);
    if (size > MAX_DATABASE_FILE_BYTES) throw new ValidationError('Without file storage set up, files can be up to 4 MB. Ask your administrator to set up file storage for larger files.');
    if (!BASE64.test(data)) throw new ValidationError('That file could not be read.');
    const [row] = await db.insert(files).values({ name, contentType: kind.type, size, store: 'database', contentBase64: data, label, status: 'ready' }).returning();
    return { file: toRow(row) };
  }

  const size = Number(b.size);
  if (!Number.isFinite(size) || size <= 0) throw new ValidationError('That file is empty.');
  if (size > MAX_FILE_BYTES) throw new ValidationError('That file is over 25 MB.');
  const key = `${new Date().getUTCFullYear()}/${randomUUID()}.${extOf(name)}`;
  const uploadUrl = await createUploadUrl(key);
  const [row] = await db.insert(files).values({ name, contentType: kind.type, size: Math.round(size), store: 'storage', storageKey: key, label, status: 'pending' }).returning();
  return { file: toRow(row), uploadUrl };
}

/** Called by the browser when its upload finished: checks the file really arrived, then makes it visible. */
export async function completeUpload(idRaw: unknown): Promise<FileRow> {
  const id = uuid(idRaw, 'File');
  const db = getDb();
  const [row] = await db.select().from(files).where(eq(files.id, id));
  if (!row) throw new NotFoundError('That file was not found.');
  if (row.status === 'ready') return toRow(row);
  if (!row.storageKey) throw new ValidationError('That upload has no file.');
  const actual = await objectSize(row.storageKey);
  if (actual === null) throw new ValidationError('The upload did not finish. Please try that file again.');
  if (actual > MAX_FILE_BYTES) {
    await removeObject(row.storageKey).catch(() => {});
    await db.delete(files).where(eq(files.id, id));
    throw new ValidationError('That file is over 25 MB.');
  }
  const [done] = await db.update(files).set({ status: 'ready', size: actual || row.size }).where(eq(files.id, id)).returning();
  return toRow(done);
}

export async function listFiles(opts: { q?: string; group?: string; limit?: number; offset?: number } = {}): Promise<{ items: FileRow[]; total: number }> {
  const db = getDb();
  const limit = Math.min(Math.max(opts.limit ?? PAGE, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const exts = opts.group ? Object.entries(FILE_TYPES).filter(([, v]) => v.group === opts.group).map(([e]) => e) : [];
  const typeMatch = exts.length ? sql`lower(${files.name}) similar to ${`%.(${exts.join('|')})`}` : undefined;
  const search = opts.q?.trim();
  const nameOrLabel = search ? sql`(${containsMatch(files.name, search)} or ${containsMatch(files.label, search)})` : undefined;
  const where = and(eq(files.status, 'ready'), typeMatch, nameOrLabel);
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({ id: files.id, name: files.name, contentType: files.contentType, size: files.size, label: files.label, createdAt: files.createdAt })
      .from(files)
      .where(where)
      .orderBy(desc(files.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(files).where(where),
  ]);
  return { items: rows.map(toRow), total: n };
}

export async function renameFile(idRaw: unknown, raw: unknown): Promise<FileRow> {
  const id = uuid(idRaw, 'File');
  const b = asRecord(raw, 'The change');
  const patch: Partial<typeof files.$inferInsert> = {};
  if (b.name !== undefined) {
    const name = text(b.name, 'File name', { max: 200 }).replace(/[\\/\u0000-\u001f]/g, '_');
    const [current] = await getDb().select({ name: files.name }).from(files).where(eq(files.id, id));
    if (!current) throw new NotFoundError('That file was not found.');
    // The type follows the extension, so a rename may not change it.
    if (extOf(name) !== extOf(current.name)) throw new ValidationError('Keep the same file ending (for example .pdf) when renaming.');
    patch.name = name;
  }
  if (b.label !== undefined) patch.label = optText(b.label, 'Label', 60) ?? null;
  if (Object.keys(patch).length === 0) throw new ValidationError('Nothing to change.');
  const [row] = await getDb().update(files).set(patch).where(eq(files.id, id)).returning();
  if (!row) throw new NotFoundError('That file was not found.');
  return toRow(row);
}

export async function deleteFile(idRaw: unknown): Promise<void> {
  const id = uuid(idRaw, 'File');
  const db = getDb();
  const [row] = await db.select({ storageKey: files.storageKey }).from(files).where(eq(files.id, id));
  if (!row) throw new NotFoundError('That file was not found.');
  if (row.storageKey) await removeObject(row.storageKey);
  await db.delete(files).where(eq(files.id, id));
}

export type DownloadTarget = { kind: 'url'; url: string } | { kind: 'bytes'; bytes: Buffer; contentType: string; name: string };

/** Where to get a file: a short-lived storage address, or (fallback) the bytes themselves. */
export async function downloadTarget(idRaw: unknown, inline: boolean): Promise<DownloadTarget> {
  const id = uuid(idRaw, 'File');
  const [row] = await getDb().select().from(files).where(and(eq(files.id, id), eq(files.status, 'ready')));
  if (!row) throw new NotFoundError('That file was not found.');
  if (row.store === 'storage' && row.storageKey) return { kind: 'url', url: await createDownloadUrl(row.storageKey, inline ? null : row.name) };
  if (!row.contentBase64) throw new NotFoundError('That file has no content.');
  return { kind: 'bytes', bytes: Buffer.from(row.contentBase64, 'base64'), contentType: row.contentType, name: row.name };
}
