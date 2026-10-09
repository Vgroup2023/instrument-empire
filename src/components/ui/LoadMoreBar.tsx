'use client';

import { Button } from '@/components/ui/Button';

/** "Showing 100 of 2,431" with a button to load the next page — shown only when there's more. */
export function LoadMoreBar({
  shown,
  total,
  loading,
  onLoadMore,
  noun,
}: {
  shown: number;
  total: number;
  loading: boolean;
  onLoadMore: () => void;
  noun: string;
}) {
  if (total <= shown) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>
        Showing the newest {shown.toLocaleString()} of {total.toLocaleString()} {noun}
      </span>
      <Button variant="secondary" onClick={onLoadMore} disabled={loading}>
        {loading ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}
