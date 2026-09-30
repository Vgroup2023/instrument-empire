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
      { href: '/dashboard/anomalies', label: 'Anomaly detection', icon: '🚨' },
      { href: '/dashboard/flux-analysis', label: 'Flux analysis', icon: '📐' },
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
    title: 'Payables',
    items: [
      { href: '/dashboard/vendors', label: 'Vendors', icon: '🏭' },
      { href: '/dashboard/bills', label: 'Bills', icon: '🧮' },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { href: '/dashboard/accounts', label: 'Chart of accounts', icon: '📚' },
      { href: '/dashboard/journal-entries', label: 'Journal entries', icon: '📒' },
      { href: '/dashboard/audit-log', label: 'Audit log', icon: '🕵️' },
    ],
  },
  {
    title: 'Banking',
    items: [
      { href: '/dashboard/expenses', label: 'Expenses', icon: '💳' },
      { href: '/dashboard/transfers', label: 'Transfers', icon: '🔁' },
      { href: '/dashboard/reconciliation', label: 'Reconciliation', icon: '🧾' },
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
    <aside className="hidden w-64 shrink-0 flex-col border-r border-steel-700 bg-steel-900 md:flex">
      <div className="flex flex-col items-center gap-1 border-b border-steel-700 px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/globlex-ai-logo.webp" alt="Globlex AI — The AI Architect Co." className="w-full max-w-[180px]" />
        <span className="text-xs font-medium uppercase tracking-wide text-steel-400">Accounts Copilot</span>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.title || 'root'}>
            {group.title ? (
              <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-steel-500">
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
                        ? 'bg-brand-500/15 text-brand-300'
                        : 'text-slate-300 hover:bg-steel-700 hover:text-slate-50',
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
