import Link from 'next/link';
import { getQboTokens } from '@/lib/session';
import { Badge } from '@/components/ui/Badge';

export async function TopBar() {
  const tokens = await getQboTokens();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-6">
      <div className="md:hidden flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
          A
        </div>
        <span className="text-sm font-semibold text-slate-900">Accounts Copilot</span>
      </div>
      <div className="hidden md:block" />
      <div className="flex items-center gap-3">
        {tokens ? (
          <Link href="/dashboard/settings" className="flex items-center gap-2">
            <Badge tone="success">● Connected</Badge>
            <span className="hidden text-sm text-slate-600 sm:inline">{tokens.companyName}</span>
          </Link>
        ) : (
          <Link href="/dashboard/settings">
            <Badge tone="warning">QuickBooks not connected</Badge>
          </Link>
        )}
        <form action="/api/logout" method="POST">
          <button
            type="submit"
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
