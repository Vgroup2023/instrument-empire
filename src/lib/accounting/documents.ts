import { getDb } from '@/db/client';
import { documents } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';

// Files attached to a specific record — an invoice, estimate, customer,
// product, or payment link. Stored directly in this app's own database
// (base64-encoded), so no separate object-storage service or extra
// credentials are needed beyond DATABASE_URL.

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

/** Lists documents attached to one record — metadata only, so this stays fast even with several large attachments. */
export async function listDocuments(entityType: DocumentEntityType, entityId: string): Promise<DocumentMeta[]> {
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
    .where(and(eq(documents.entityType, entityType), eq(documents.entityId, entityId)))
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
  entityId: string;
  fileName: string;
  contentType: string;
  contentBase64: string;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<DocumentMeta> {
  if (!input.fileName.trim()) throw new Error('File name is required.');
  // Base64 encodes 3 bytes as 4 characters, so this approximates the original file size.
  const fileSize = Math.floor((input.contentBase64.length * 3) / 4);
  if (fileSize > MAX_DOCUMENT_SIZE_BYTES) {
    throw new Error(`File is too large — the limit is ${MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024)}MB.`);
  }
  const db = getDb();
  const [row] = await db
    .insert(documents)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      fileName: input.fileName,
      contentType: input.contentType || 'application/octet-stream',
      fileSize,
      contentBase64: input.contentBase64,
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
  const db = getDb();
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  if (!row) throw new Error('Document not found.');
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
  const db = getDb();
  const deleted = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });
  if (deleted.length === 0) throw new Error('Document not found.');
}
