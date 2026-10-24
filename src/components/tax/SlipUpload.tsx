'use client';

import { useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { readFileBase64 } from '@/components/rfqs/api';
import type { Country } from '@/lib/tax';
import { SLIP_BOXES, MAX_SLIP_BYTES, type ExtractedSlip } from '@/lib/tax/slipTypes';

/**
 * "Upload your W-2 or T4": Claude reads the boxes, the person checks and can correct each number, and only then
 * are the amounts added to the return. Several jobs mean several uploads; each one adds to the totals.
 */
export function SlipUpload({ country, onAdd }: { country: Country; onAdd: (values: Record<string, number>) => void }) {
  const slipName = country === 'US' ? 'W-2' : 'T4';
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slip, setSlip] = useState<ExtractedSlip | null>(null);
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(0);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSlip(null);
    if (file.size > MAX_SLIP_BYTES) {
      setError('That file is over 4 MB. Try a smaller photo.');
      return;
    }
    setBusy(true);
    try {
      const data = await readFileBase64(file);
      const res = await fetch('/api/tax/slip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country, fileName: file.name, mimeType: file.type, data }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not read that file.');
      const read = body.slip as ExtractedSlip;
      setSlip(read);
      setEdited(Object.fromEntries(Object.entries(read.values).map(([k, v]) => [k, String(v)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  }

  function add() {
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(edited)) {
      const n = Number(v);
      if (v !== '' && Number.isFinite(n) && n >= 0) values[k] = n;
    }
    onAdd(values);
    setSlip(null);
    setAdded((n) => n + 1);
  }

  return (
    <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Skip the typing: upload your {slipName}</p>
          <p className="text-xs text-slate-600">A photo or PDF. Claude reads the boxes and you check them before they are added. The file is sent to Claude to be read and is not stored.</p>
        </div>
        <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label={`${slipName} file`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pick(f); }} />
        <Button loading={busy} variant="secondary" onClick={() => input.current?.click()}>
          {added > 0 ? `Upload another ${slipName}` : `Upload ${slipName}`}
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {added > 0 && !slip ? <p className="mt-3 text-sm text-emerald-700">Added to your return. Had more than one job? Upload the next {slipName}, and each one is added to the totals below.</p> : null}
      {slip ? (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">
            Check what we read{slip.employer ? ` from ${slip.employer}` : ''}
          </p>
          {slip.warnings.map((w) => (
            <p key={w} className="flex gap-2 text-sm text-gold-800">
              <Badge tone="warning">Check</Badge>
              {w}
            </p>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            {SLIP_BOXES[country].map((b) => (
              <label key={b.key} className="block text-xs font-medium text-slate-700">
                {b.label}
                <Input type="number" step="0.01" min={0} inputMode="decimal" className="mt-1" value={edited[b.key] ?? ''} placeholder="Not on slip" onChange={(e) => setEdited((cur) => ({ ...cur, [b.key]: e.target.value }))} />
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSlip(null)}>
              Discard
            </Button>
            <Button onClick={add} disabled={Object.values(edited).every((v) => v === '')}>
              Add to my return
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
