import Link from 'next/link';
import { getQboTokens } from '@/lib/session';
import { Badge } from '@/components/ui/Badge';
import { MobileNavDrawer } from './MobileNavDrawer';
import { SearchButton } from './SearchButton';
import { AlertBells } from './AlertBells';
import { NavIcon } from './NavIcon';
import { BRAND } from '@/lib/brand';

export async function TopBar() {
  // The QuickBooks badge is optional: a problem reading it must never take the whole page down.
  const tokens = await getQboTokens().catch(() => null);

  return (
    <header className="safe-top flex min-h-16 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 print:hidden lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavDrawer />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/globlex-logo-360.v1.webp" width={360} height={240} decoding="async" alt="Globlex AI" className="h-9 w-auto min-w-0 rounded-md lg:hidden" />
        <div className="hidden min-w-0 lg:block">
          <div className="truncate text-lg font-extrabold uppercase tracking-wide text-[#0f2447]">{BRAND.name}</div>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <SearchButton />
        <AlertBells />
        <Link prefetch={false} href="/dashboard/settings" aria-label="Settings" className="hidden rounded-lg p-2 text-[#0f2447] hover:bg-slate-100 sm:block">
          <NavIcon name="gear" size={22} />
        </Link>
        {tokens ? (
          <Link prefetch={false} href="/dashboard/settings" className="hidden items-center gap-2 xl:flex">
            <Badge tone="success">● QuickBooks connected</Badge>
          </Link>
        ) : null}
        <div className="ml-1 hidden items-center gap-2.5 border-l border-slate-200 pl-3 md:flex">
          <div className="text-right leading-tight">
            <div className="text-[13px] font-semibold text-[#0f2447]">Office team</div>
            <div className="text-[11px] text-slate-500">{tokens?.companyName ?? BRAND.tagline}</div>
          </div>
          <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0c2340] text-[13px] font-bold text-white">OE</span>
        </div>
        <form action="/api/logout" method="POST">
          <button type="submit" className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-[#0f2447]">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
