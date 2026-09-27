import { promises as fs } from 'fs';
import path from 'path';

// A tiny file-backed JSON store for lightweight app-owned state (currently:
// recurring invoice/estimate schedules) that has no equivalent in the public
// QuickBooks Online API. This assumes a persistent filesystem (a normal
// Node process, container, or VM). On a serverless platform whose
// filesystem resets between invocations, swap this for a real database or
// KV store — the read/write surface here is intentionally tiny.

const DATA_DIR = path.join(process.cwd(), 'data');

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile<T>(fileName: string, data: T): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
}
