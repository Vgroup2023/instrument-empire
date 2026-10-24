'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { readFileBase64 } from '@/components/rfqs/api';
import { formatDate } from '@/lib/format';
import { ACCEPT_ATTR, FILE_GROUPS, MAX_DATABASE_FILE_BYTES, MAX_FILE_BYTES, extOf, fileKind, formatBytes, type FileRow } from '@/lib/files/types';
import { compressImage } from './compressImage';

type Upload = { key: number; name: string; progress: number | null; state: 'uploading' | 'done' | 'error'; error?: string };

const ICON: Record<string, string> = { image: '🖼️', pdf: '📕', office: '📄', data: '📊' };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Something went wrong.');
  return data as T;
}

/** Sends the file straight to storage, reporting progress. Resolves when the browser has finished sending. */
function putFile(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage refused the upload (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.send(file);
  });
}

export function FilesClient({ initial, mode, storageProblem }: { initial: { items: FileRow[]; total: number }; mode: 'storage' | 'database'; storageProblem: string | null }) {
  const { notify } = useToast();
  const [items, setItems] = useState(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const [renaming, setRenaming] = useState<FileRow | null>(null);
  const [newName, setNewName] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const firstLoad = useRef(true);

  const limit = mode === 'storage' ? MAX_FILE_BYTES : MAX_DATABASE_FILE_BYTES;

  const load = useCallback(async (q: string, g: string, offset: number) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ offset: String(offset) });
      if (q.trim()) p.set('q', q.trim());
      if (g) p.set('group', g);
      const data = await api<{ items: FileRow[]; total: number }>(`/api/files?${p}`);
      setItems((cur) => (offset === 0 ? data.items : [...cur, ...data.items]));
      setTotal(data.total);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not load files.', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  // Searching or filtering asks the server for the matching page; the first render already has the newest files.
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const t = setTimeout(() => void load(query, group, 0), 250);
    return () => clearTimeout(t);
  }, [query, group, load]);

  function patchUpload(key: number, patch: Partial<Upload>) {
    setUploads((cur) => cur.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  async function uploadOne(original: File, key: number) {
    try {
      const kind = fileKind(original.name);
      if (!kind) throw new Error('That kind of file is not accepted. Use a PDF, photo, Word, Excel, PowerPoint, CSV or text file.');
      const file = await compressImage(original);
      if (file.size > limit) throw new Error(mode === 'storage' ? 'That file is over 25 MB.' : 'Files can be up to 4 MB until file storage is set up.');
      let created: FileRow;
      if (mode === 'database') {
        const contentBase64 = await readFileBase64(file);
        created = (await api<{ file: FileRow }>('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, contentBase64 }) })).file;
      } else {
        const started = await api<{ file: FileRow; uploadUrl: string }>('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, size: file.size }) });
        await putFile(started.uploadUrl, file, (f) => patchUpload(key, { progress: f }));
        created = (await api<{ file: FileRow }>(`/api/files/${started.file.id}/complete`, { method: 'POST' })).file;
      }
      patchUpload(key, { state: 'done', progress: 1 });
      setItems((cur) => [created, ...cur.filter((x) => x.id !== created.id)]);
      setTotal((t) => t + 1);
    } catch (err) {
      patchUpload(key, { state: 'error', error: err instanceof Error ? err.message : 'Upload failed.' });
    }
  }

  function addFiles(list: FileList | File[] | null) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    const entries = picked.map((file) => ({ file, key: ++seq.current }));
    setUploads((cur) => [...entries.map(({ file, key }) => ({ key, name: file.name, progress: mode === 'storage' ? 0 : null, state: 'uploading' as const })), ...cur].slice(0, 12));
    // Two at a time keeps a phone's connection and memory comfortable.
    void (async () => {
      const queue = [...entries];
      await Promise.all([0, 1].map(async () => {
        for (let next = queue.shift(); next; next = queue.shift()) await uploadOne(next.file, next.key);
      }));
    })();
  }

  async function open(row: FileRow) {
    try {
      const inlineOk = /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(row.contentType);
      const { url } = await api<{ url: string }>(`/api/files/${row.id}${inlineOk ? '?inline=1' : ''}`);
      if (row.contentType.startsWith('image/')) setPreview({ name: row.name, url });
      else window.open(url, '_blank', 'noopener');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not open that file.', 'error');
    }
  }

  async function download(row: FileRow) {
    try {
      const { url } = await api<{ url: string }>(`/api/files/${row.id}`);
      const a = document.createElement('a');
      a.href = url;
      a.download = row.name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not download that file.', 'error');
    }
  }

  async function saveRename() {
    if (!renaming) return;
    try {
      const { file } = await api<{ file: FileRow }>(`/api/files/${renaming.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, label: newLabel }) });
      setItems((cur) => cur.map((x) => (x.id === file.id ? file : x)));
      setRenaming(null);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save.', 'error');
    }
  }

  async function remove(row: FileRow) {
    if (!window.confirm(`Delete ${row.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/files/${row.id}`, { method: 'DELETE' });
      setItems((cur) => cur.filter((x) => x.id !== row.id));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not delete.', 'error');
    }
  }

  return (
    <div className="space-y-6">
      {mode === 'database' ? (
        <p className="rounded-lg bg-gold-50 p-3 text-xs text-gold-800">File storage is not set up yet, so files are kept in the database and can be up to 4 MB. Ask your administrator to add SUPABASE_SERVICE_ROLE_KEY for files up to 25 MB that do not weigh on the app.</p>
      ) : null}
      {storageProblem ? <p className="rounded-lg bg-red-50 p-3 text-xs text-red-800">{storageProblem}</p> : null}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`rounded-xl2 border-2 border-dashed p-5 text-center ${dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300'}`}
      >
        <p className="text-sm font-medium text-slate-900">Drop files here, or</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button onClick={() => picker.current?.click()}>Upload files</Button>
          <Button variant="secondary" onClick={() => camera.current?.click()}>
            Take a photo
          </Button>
        </div>
        <p className="mt-3 text-xs text-slate-500">PDF, photos, Word, Excel, PowerPoint, CSV or text, up to {formatBytes(limit)} each. Photos are shrunk before sending so uploads are quick on a phone.</p>
        <input ref={picker} type="file" multiple accept={ACCEPT_ATTR} className="sr-only" tabIndex={-1} aria-label="Choose files" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a photo" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {uploads.length > 0 ? (
        <ul className="space-y-2" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.key} className="rounded-lg border border-slate-200 bg-surface px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium text-slate-900">{u.name}</span>
                <span className={u.state === 'error' ? 'text-red-700' : u.state === 'done' ? 'text-emerald-700' : 'text-slate-500'}>
                  {u.state === 'done' ? 'Uploaded' : u.state === 'error' ? 'Failed' : u.progress === null ? 'Sending…' : `${Math.round(u.progress * 100)}%`}
                </span>
              </div>
              {u.state === 'uploading' && u.progress !== null ? (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-slate-100">
                  <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
                </div>
              ) : null}
              {u.error ? <p className="mt-1 text-xs text-red-700">{u.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files by name or label…" aria-label="Search files" className="sm:max-w-xs" />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              {[{ value: '', label: 'All' }, ...FILE_GROUPS].map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setGroup(g.value)}
                  aria-pressed={group === g.value}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${group === g.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 sm:ml-auto">{total.toLocaleString()} file{total === 1 ? '' : 's'}</p>
          </div>

          {items.length === 0 ? (
            <EmptyState title={query || group ? 'No files match' : 'No files yet'} description={query || group ? 'Try a different search or filter.' : 'Upload a file above, or drop one onto the box.'} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((f) => {
                const g = fileKind(f.name)?.group ?? 'office';
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span aria-hidden className="text-xl">{ICON[g]}</span>
                    <button type="button" onClick={() => open(f)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-sm font-medium text-slate-900 hover:underline">{f.name}</span>
                      <span className="block text-xs text-slate-500">
                        {formatBytes(f.size)} · {formatDate(f.createdAt)} · {extOf(f.name).toUpperCase()}
                        {f.label ? <> · <Badge tone="neutral">{f.label}</Badge></> : null}
                      </span>
                    </button>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => download(f)}>
                        Download
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRenaming(f); setNewName(f.name); setNewLabel(f.label ?? ''); }}>
                        Rename
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(f)}>
                        Delete
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {items.length < total ? (
            <div className="text-center">
              <Button variant="secondary" loading={loading} onClick={() => load(query, group, items.length)}>
                Show more
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title={preview?.name ?? ''} size="lg">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt={preview.name} className="mx-auto max-h-[70vh] w-auto max-w-full rounded" />
        ) : null}
      </Modal>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename file"
        description="Keep the same ending, for example .pdf. The label groups files, for example Customs or Receipts."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={saveRename} disabled={!newName.trim()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-700">
            Name
            <Input className="mt-1" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            Label (optional)
            <Input className="mt-1" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={60} />
          </label>
        </div>
      </Modal>
    </div>
  );
}
