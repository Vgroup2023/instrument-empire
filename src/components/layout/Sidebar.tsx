'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Insights',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '📊' },
      { href: '/dashboard/ar-ap', label: 'A/R & A/P aging', icon: '⏱️' },
      { href: '/dashboard/sales', label: 'Sales breakdown', icon: '📈' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { href: '/dashboard/invoices', label: 'Invoices', icon: '🧾' },
      { href: '/dashboard/estimates', label: 'Estimates', icon: '📝' },
      { href: '/dashboard/customers', label: 'Customers', icon: '👥' },
      { href: '/dashboard/products', label: 'Products & services', icon: '📦' },
      { href: '/dashboard/payments', label: 'Payment links & reminders', icon: '🔗' },
    ],
  },
  {
    title: 'People & money',
    items: [
      { href: '/dashboard/payroll', label: 'Payroll', icon: '💼' },
      { href: '/dashboard/capital', label: 'QuickBooks Capital', icon: '🏦' },
    ],
  },
  {
    title: '',
    items: [{ href: '/dashboard/settings', label: 'Settings & connection', icon: '⚙️' }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-slate-100 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-semibold text-white">
          A
        </div>
        <span className="text-sm font-semibold text-slate-900">Accounts Copilot</span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.title || 'root'}>
            {group.title ? (
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group.title}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition',
                      active
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                    )}
                  >
                    <span aria-hidden>{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
