import { NextResponse } from 'next/server';
import { ensureBucket, storageConfigured, StorageError } from '@/lib/files/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Whether file storage is set up and reachable, with a plain reason when it is not. */
export async function GET() {
  if (!storageConfigured()) return NextResponse.json({ mode: 'database', ok: true });
  try {
    await ensureBucket();
    return NextResponse.json({ mode: 'storage', ok: true });
  } catch (err) {
    return NextResponse.json({ mode: 'storage', ok: false, error: err instanceof StorageError ? err.message : 'File storage could not be reached.' });
  }
}
