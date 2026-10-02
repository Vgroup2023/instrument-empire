import Link from 'next/link';
import { navGroups } from '@/components/layout/navGroups';
import { Badge } from '@/components/ui/Badge';
import { providers } from '@/lib/config';

/**
 * Every tab in the app, grouped the way the sidebar groups them, with live
 * open-work counts where there are any. Reads navGroups, so a new page shows
 * up here as soon as it is added to the navigation.
 */
export function MasterTabGrid({ badges, excludeHref }: { badges: Record<string, number>; excludeHref?: string }) {
  return (
    <div className="space-y-8">
      {navGroups.map((group) => {
        const items = group.items.filter((i) => i.href !== excludeHref);
        if (!items.length) return null;
        return (
          <section key={group.title} aria-labelledby={`grp-${group.title}`}>
            <h3 id={`grp-${group.title}`} className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {group.title}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => {
                const count = badges[item.href];
                const sample = item.demoProvider ? providers[item.demoProvider] === 'mock' : false;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-start gap-3 rounded-xl2 border border-slate-200 bg-surface p-4 shadow-card transition hover:border-brand-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-lg group-hover:bg-brand-100">
                      {item.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-700">{item.label}</p>
                        {count ? <Badge tone="warning">{count} open</Badge> : null}
                        {sample ? <Badge>Sample data</Badge> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-3 text-xs text-slate-500">{item.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
