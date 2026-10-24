// Object storage for the Files library, using Supabase Storage over plain HTTPS (no SDK, so nothing heavy is added).
// The browser uploads to and downloads from storage directly using short-lived signed addresses created here, so a
// file never passes through the app server: no request-size limit, no function timeout, and no load on the app.
//
// Setup is one secret, SUPABASE_SERVICE_ROLE_KEY. The project address is worked out from DATABASE_URL (a Supabase
// connection string names the project), or set SUPABASE_URL to override it. Without the key the Files tab falls back
// to keeping small files in the database.

export const BUCKET = process.env.FILES_BUCKET || 'erp-files';
export const MAX_STORAGE_BYTES = 25 * 1024 * 1024;

export function supabaseUrl(): string | null {
  const explicit = process.env.SUPABASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const db = process.env.DATABASE_URL;
  if (!db) return null;
  try {
    const u = new URL(db);
    // Pooler connection: the user is "postgres.<project ref>".
    const fromUser = decodeURIComponent(u.username).match(/^postgres\.([a-z0-9]{10,})$/);
    if (fromUser) return `https://${fromUser[1]}.supabase.co`;
    // Direct connection: the host is "db.<project ref>.supabase.co".
    const fromHost = u.hostname.match(/^db\.([a-z0-9]{10,})\.supabase\.co$/);
    if (fromHost) return `https://${fromHost[1]}.supabase.co`;
  } catch {
    // fall through
  }
  return null;
}

function serviceKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

/** True when uploads can go to object storage. */
export function storageConfigured(): boolean {
  return Boolean(serviceKey() && supabaseUrl());
}

export class StorageError extends Error {}

async function call(path: string, init: RequestInit & { json?: unknown } = {}): Promise<Response> {
  const base = supabaseUrl();
  const key = serviceKey();
  if (!base || !key) throw new StorageError('File storage is not set up.');
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, apikey: key, ...(init.headers as Record<string, string> | undefined) };
  let body = init.body;
  if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`${base}/storage/v1${path}`, { ...init, headers, body, signal: AbortSignal.timeout(8000) });
  return res;
}

async function fail(res: Response, what: string): Promise<never> {
  let detail = '';
  try {
    const data = (await res.json()) as { message?: string; error?: string };
    detail = data.message ?? data.error ?? '';
  } catch {
    // no body
  }
  const hint = res.status === 401 || res.status === 403 ? ' Check that SUPABASE_SERVICE_ROLE_KEY is the project\'s service role key.' : '';
  throw new StorageError(`File storage ${what} failed (${res.status}${detail ? `: ${detail}` : ''}).${hint}`);
}

let bucketReady = false;

/** Creates the private bucket the first time it is needed. Safe to call again. */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const res = await call('/bucket', { method: 'POST', json: { id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_STORAGE_BYTES } });
  if (res.ok || res.status === 409) {
    bucketReady = true;
    return;
  }
  // Some versions answer 400 with "already exists".
  let text = '';
  try {
    text = JSON.stringify(await res.clone().json());
  } catch {
    // no body
  }
  if (res.status === 400 && /exist/i.test(text)) {
    bucketReady = true;
    return;
  }
  return fail(res, 'bucket setup');
}

/** An address the browser can PUT the file to, valid for a couple of hours. */
export async function createUploadUrl(key: string): Promise<string> {
  await ensureBucket();
  const res = await call(`/object/upload/sign/${BUCKET}/${key}`, { method: 'POST', json: {} });
  if (!res.ok) return fail(res, 'upload');
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new StorageError('File storage did not return an upload address.');
  return `${supabaseUrl()}/storage/v1${data.url.startsWith('/') ? '' : '/'}${data.url}`;
}

/** The size in bytes of a stored object, or null if it is not there. */
export async function objectSize(key: string): Promise<number | null> {
  const res = await call(`/object/info/${BUCKET}/${key}`);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) return fail(res, 'check');
  const data = (await res.json()) as { size?: number; metadata?: { size?: number } };
  return data.size ?? data.metadata?.size ?? 0;
}

/** A short-lived address that downloads (or shows) the file. */
export async function createDownloadUrl(key: string, downloadName: string | null, expiresInSeconds = 600): Promise<string> {
  const res = await call(`/object/sign/${BUCKET}/${key}`, { method: 'POST', json: { expiresIn: expiresInSeconds } });
  if (!res.ok) return fail(res, 'download');
  const data = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const path = data.signedURL ?? data.signedUrl;
  if (!path) throw new StorageError('File storage did not return a download address.');
  const full = `${supabaseUrl()}/storage/v1${path.startsWith('/') ? '' : '/'}${path}`;
  return downloadName ? `${full}${full.includes('?') ? '&' : '?'}download=${encodeURIComponent(downloadName)}` : full;
}

export async function removeObject(key: string): Promise<void> {
  const res = await call(`/object/${BUCKET}`, { method: 'DELETE', json: { prefixes: [key] } });
  if (!res.ok && res.status !== 404) return fail(res, 'delete');
}
