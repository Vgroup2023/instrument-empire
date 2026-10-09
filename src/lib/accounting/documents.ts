import { getDb } from '@/db/client';
import { documents } from '@/db/schema';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ValidationError, NotFoundError, asRecord, oneOf, optUuid, text, uuid } from '@/lib/validation';

// Files attached to a record — an invoice, estimate, customer, product, or
// payment link — or, when entityId is omitted, general documents filed under
// that tab rather than one specific record (e.g. before any rows exist yet).
// Stored directly in this app's own database (base64-encoded), so no
// separate object-storage service or extra credentials are needed beyond
// DATABASE_URL.

export type DocumentEntityType = 'invoice' | 'estimate' | 'customer' | 'product' | 'payment_link';

/** Keeps request payloads and database rows well within typical serverless body-size limits — meant for contracts/receipts/spec sheets, not large media. */
export const MAX_DOCUMENT_SIZE_BYTES = 4 * 1024 * 1024;

export interface DocumentMeta {
  Id: string;
  FileName: string;
  ContentType: string;
  FileSize: number;
  UploadedAt: string;
}

export interface DocumentContent extends DocumentMeta {
  ContentBase64: string;
}

/** Lists documents attached to one record, or general documents for a tab when entityId is omitted — metadata only, so this stays fast even with several large attachments. */
export async function listDocuments(entityType: DocumentEntityType, entityId?: string): Promise<DocumentMeta[]> {
  if (entityId !== undefined) uuid(entityId, 'Record');
  const db = getDb();
  const rows = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      contentType: documents.contentType,
      fileSize: documents.fileSize,
      uploadedAt: documents.uploadedAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.entityType, entityType),
        entityId ? eq(documents.entityId, entityId) : isNull(documents.entityId),
      ),
    )
    .orderBy(desc(documents.uploadedAt));
  return rows.map((row) => ({
    Id: row.id,
    FileName: row.fileName,
    ContentType: row.contentType,
    FileSize: row.fileSize,
    UploadedAt: row.uploadedAt.toISOString(),
  }));
}

export interface UploadDocumentInput {
  entityType: DocumentEntityType;
  entityId?: string;
  fileName: string;
  contentType: string;
  contentBase64: string;
}

const ENTITY_TYPES = ['invoice', 'estimate', 'customer', 'product', 'payment_link'] as const;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export async function uploadDocument(rawInput: UploadDocumentInput): Promise<DocumentMeta> {
  const raw = asRecord(rawInput, 'The upload');
  const entityType = oneOf(raw.entityType, 'Attach to', ENTITY_TYPES);
  const entityId = optUuid(raw.entityId, 'Record');
  const fileName = text(raw.fileName, 'File name', { max: 255 });
  const contentType = typeof raw.contentType === 'string' ? raw.contentType.trim().slice(0, 120) : '';
  if (typeof raw.contentBase64 !== 'string' || raw.contentBase64.length === 0) throw new ValidationError('A file is required.');
  const contentBase64 = raw.contentBase64;
  // Check the size before running a regex over a multi-megabyte string.
  // Base64 encodes 3 bytes as 4 characters, so this approximates the original file size.
  const fileSize = Math.floor((contentBase64.length * 3) / 4);
  if (fileSize > MAX_DOCUMENT_SIZE_BYTES) {
    throw new ValidationError(`File is too large — the limit is ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)}MB.`);
  }
  if (!BASE64.test(contentBase64) || contentBase64.length % 4 !== 0) throw new ValidationError('The file content is not valid.');
  const db = getDb();
  const [row] = await db
    .insert(documents)
    .values({
      entityType,
      entityId: entityId ?? null,
      fileName,
      contentType: contentType || 'application/octet-stream',
      fileSize,
      contentBase64,
    })
    .returning({
      id: documents.id,
      fileName: documents.fileName,
      contentType: documents.contentType,
      fileSize: documents.fileSize,
      uploadedAt: documents.uploadedAt,
    });
  return {
    Id: row.id,
    FileName: row.fileName,
    ContentType: row.contentType,
    FileSize: row.fileSize,
    UploadedAt: row.uploadedAt.toISOString(),
  };
}

/** Fetches a document's full content for download — kept separate from listDocuments() so listing stays cheap. */
export async function getDocumentContent(id: string): Promise<DocumentContent> {
  uuid(id, 'Document');
  const db = getDb();
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  if (!row) throw new NotFoundError('Document not found.');
  return {
    Id: row.id,
    FileName: row.fileName,
    ContentType: row.contentType,
    FileSize: row.fileSize,
    UploadedAt: row.uploadedAt.toISOString(),
    ContentBase64: row.contentBase64,
  };
}

export async function deleteDocument(id: string): Promise<void> {
  uuid(id, 'Document');
  const db = getDb();
  const deleted = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });
  if (deleted.length === 0) throw new NotFoundError('Document not found.');
}
