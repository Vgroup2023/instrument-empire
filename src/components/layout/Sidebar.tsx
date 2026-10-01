import { NavLinksList } from './NavLinksList';

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 bg-header-gradient lg:flex">
      <div className="flex flex-col items-center gap-1 border-b border-white/10 px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/globlex-ai-logo.webp" alt="Globlex AI — The AI Architect Co." className="w-full min-w-0 max-w-[180px]" />
        <span className="text-xs font-medium uppercase tracking-wide text-steel-400">Accounts Copilot</span>
      </div>
      <NavLinksList />
    </aside>
  );
}
