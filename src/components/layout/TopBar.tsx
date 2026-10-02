import Link from 'next/link';
import { getQboTokens } from '@/lib/session';
import { Badge } from '@/components/ui/Badge';
import { MobileNavDrawer } from './MobileNavDrawer';
import { BRAND } from '@/lib/brand';

export async function TopBar() {
  const tokens = await getQboTokens();

  return (
    <header className="safe-top flex min-h-16 items-center justify-between border-b border-white/10 bg-header-gradient px-4 lg:px-6">
      <div className="flex items-center gap-2">
        <MobileNavDrawer />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/globlex-ai-logo.webp" alt="Globlex AI" className="h-10 w-auto min-w-0 lg:hidden" />
      </div>
      <div className="min-w-0 flex-1 px-3 text-left lg:px-0">
        <div className="truncate text-sm font-semibold text-slate-50">
          <span className="sm:hidden">{BRAND.shortName}</span>
          <span className="hidden sm:inline">{BRAND.name}</span>
        </div>
        <div className="truncate text-xs text-steel-400">{BRAND.tagline}</div>
      </div>
      <div className="flex items-center gap-3">
        {tokens ? (
          <Link href="/dashboard/settings" className="flex items-center gap-2">
            <Badge tone="success">● QuickBooks connected</Badge>
            <span className="hidden text-sm text-slate-300 sm:inline">{tokens.companyName}</span>
          </Link>
        ) : null}
        <form action="/api/logout" method="POST">
          <button
            type="submit"
            className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-slate-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
