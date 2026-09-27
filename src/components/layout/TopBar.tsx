import Link from 'next/link';
import { getQboTokens } from '@/lib/session';
import { Badge } from '@/components/ui/Badge';

export async function TopBar() {
  const tokens = await getQboTokens();

  return (
    <header className="flex h-16 items-center justify-between border-b border-steel-700 bg-surface px-4 md:px-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/globlex-ai-logo.webp" alt="Globlex AI" className="h-10 md:hidden" />
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        {tokens ? (
          <Link href="/dashboard/settings" className="flex items-center gap-2">
            <Badge tone="success">● Connected</Badge>
            <span className="hidden text-sm text-slate-300 sm:inline">{tokens.companyName}</span>
          </Link>
        ) : (
          <Link href="/dashboard/settings">
            <Badge tone="warning">QuickBooks not connected</Badge>
          </Link>
        )}
        <form action="/api/logout" method="POST">
          <button
            type="submit"
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-400 hover:bg-steel-700"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
