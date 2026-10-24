import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { describeError } from '@/lib/errors';
import { filesMode, listFiles } from '@/lib/files/service';
import { ensureBucket, StorageError } from '@/lib/files/storage';
import { FilesClient } from '@/components/files/FilesClient';

export const dynamic = 'force-dynamic';

export default async function FilesPage() {
  let initial: Awaited<ReturnType<typeof listFiles>> | null = null;
  let loadError: unknown = null;
  try {
    initial = await listFiles();
  } catch (err) {
    loadError = err;
  }
  // With object storage, say plainly if it cannot be reached (wrong key, project paused) instead of failing on the first upload.
  let storageProblem: string | null = null;
  if (filesMode() === 'storage') {
    try {
      await ensureBucket();
    } catch (err) {
      storageProblem = err instanceof StorageError ? err.message : 'File storage could not be reached.';
    }
  }
  return (
    <div>
      <PageHeader title="Files" description="Upload, open and download documents and photos from any device. Files go straight to storage, so they do not slow the app down." />
      {initial ? <FilesClient initial={initial} mode={filesMode()} storageProblem={storageProblem} /> : <EmptyState title="Couldn't load files" description={describeError(loadError, 'Please try again.')} />}
    </div>
  );
}
