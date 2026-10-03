import { NavLinksList } from './NavLinksList';
import { BRAND } from '@/lib/brand';

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-header-gradient lg:flex">
      <div className="flex flex-col items-center gap-1 border-b border-white/10 px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/globlex-logo-360.v1.webp" width={360} height={240} decoding="async" alt="Globlex AI — The AI Architect Co." className="w-full min-w-0 max-w-[180px]" />
        <span className="text-center text-xs font-semibold uppercase tracking-wide text-slate-100">{BRAND.name}</span>
        <span className="text-center text-[11px] text-steel-400">{BRAND.tagline}</span>
      </div>
      <NavLinksList />
    </aside>
  );
}
