'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';
import type { DocumentEntityType } from '@/lib/accounting/documents';

const MAX_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024;

interface DocumentMeta {
  Id: string;
  FileName: string;
  ContentType: string;
  FileSize: number;
  UploadedAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Reads a File as base64, stripping the "data:<type>;base64," prefix FileReader includes. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * A modal listing the documents attached to one record (an invoice, estimate,
 * customer, product, or payment link), with upload/download/delete — files
 * are stored directly in this app's own database, no separate storage
 * service required.
 */
export function DocumentsDialog({
  entityType,
  entityId,
  title,
  onClose,
}: {
  entityType: DocumentEntityType;
  entityId?: string;
  title: string;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ entityType });
      if (entityId) params.set('entityId', entityId);
      const res = await fetch(`/api/documents?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch when the dialog opens, not a derived-state sync
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only needs to run once per dialog open
  }, []);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      notify(`File is too large — the limit is ${MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)}MB.`, 'error');
      return;
    }
    setUploading(true);
    try {
      const contentBase64 = await readFileAsBase64(file);
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          entityId,
          fileName: file.name,
          contentType: file.type,
          contentBase64,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to upload document.');
      }
      notify('Document uploaded.');
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: DocumentMeta) {
    if (!window.confirm(`Delete "${doc.FileName}"? This can't be undone.`)) return;
    setDeletingId(doc.Id);
    try {
      const res = await fetch(`/api/documents/${doc.Id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to delete document.');
      }
      notify('Document deleted.');
      refresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Something went wrong.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Documents — ${title}`}
      description="Upload contracts, receipts, or other files related to this record."
    >
      <div className="space-y-4">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
        <Button
          type="button"
          size="sm"
          loading={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          + Upload document
        </Button>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : documents.length === 0 ? (
          <EmptyState title="No documents yet" description="Upload a file to attach it to this record." />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
            {documents.map((doc) => (
              <li key={doc.Id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{doc.FileName}</p>
                  <p className="text-xs text-slate-500">
                    {formatFileSize(doc.FileSize)} · Uploaded {formatDate(doc.UploadedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => window.open(`/api/documents/${doc.Id}`, '_blank')}>
                    Download
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={deletingId === doc.Id}
                    onClick={() => handleDelete(doc)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
