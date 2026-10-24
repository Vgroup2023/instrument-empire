// File kinds the library accepts, shared by the browser (to check a file before uploading it) and the server (which
// checks again). The extension decides the type, because browsers report odd types for office files. Anything that can
// run in a browser (HTML, SVG, scripts) is refused so a stored file can never become a way to attack whoever opens it.

export const FILE_TYPES: Record<string, { type: string; group: 'image' | 'pdf' | 'office' | 'data' }> = {
  pdf: { type: 'application/pdf', group: 'pdf' },
  png: { type: 'image/png', group: 'image' },
  jpg: { type: 'image/jpeg', group: 'image' },
  jpeg: { type: 'image/jpeg', group: 'image' },
  webp: { type: 'image/webp', group: 'image' },
  gif: { type: 'image/gif', group: 'image' },
  doc: { type: 'application/msword', group: 'office' },
  docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', group: 'office' },
  xls: { type: 'application/vnd.ms-excel', group: 'data' },
  xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', group: 'data' },
  ppt: { type: 'application/vnd.ms-powerpoint', group: 'office' },
  pptx: { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', group: 'office' },
  csv: { type: 'text/csv', group: 'data' },
  txt: { type: 'text/plain', group: 'office' },
};

export const FILE_GROUPS = [
  { value: 'image', label: 'Photos' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'office', label: 'Documents' },
  { value: 'data', label: 'Spreadsheets' },
] as const;

export const ACCEPT_ATTR = Object.keys(FILE_TYPES).map((e) => `.${e}`).join(',');

/** The lower-case extension of a file name, or '' if it has none. */
export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function fileKind(name: string): { type: string; group: 'image' | 'pdf' | 'office' | 'data' } | null {
  return FILE_TYPES[extOf(name)] ?? null;
}

/** The largest file the library takes: with object storage, and the fallback that keeps files in the database. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_DATABASE_FILE_BYTES = 4 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 102.4) / 10} KB`;
  return `${Math.round(n / 104857.6) / 10} MB`;
}

export interface FileRow {
  id: string;
  name: string;
  contentType: string;
  size: number;
  label: string | null;
  createdAt: string;
}
