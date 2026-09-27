import Link from 'next/link';
import { navSections } from '@/lib/navSections';

/**
 * The dashboard's front door: one tile per section of the app so every
 * screen is one click away from the page you land on right after login.
 */
export function QuickAccessGrid({ excludeHref }: { excludeHref?: string }) {
  const sections = navSections.filter((section) => section.href !== excludeHref);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {sections.map((section) => (
        <Link
          key={section.href}
          href={section.href}
          className="group flex items-start gap-3 rounded-xl2 border border-steel-700 bg-surface p-4 shadow-card transition hover:border-brand-300 hover:shadow-md"
        >
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-lg group-hover:bg-brand-100"
          >
            {section.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-50 group-hover:text-brand-700">{section.title}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{section.description}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
