import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/** Slim dark royal blue footer under every page of the app. */
export function AppFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="shrink-0 border-t border-white/10 bg-header-gradient px-4 py-3 text-xs text-slate-200 print:hidden lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p>
          © {year} {BRAND.name} · {BRAND.tagline}
        </p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link prefetch={false} href="/dashboard/guide" className="hover:text-white hover:underline">
            Training guide
          </Link>
          <Link prefetch={false} href="/dashboard/settings" className="hover:text-white hover:underline">
            Settings
          </Link>
          <Link prefetch={false} href="/install" className="hover:text-white hover:underline">
            Install the app
          </Link>
        </nav>
      </div>
    </footer>
  );
}
