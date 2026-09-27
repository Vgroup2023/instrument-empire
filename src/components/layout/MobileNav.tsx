'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const items = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/ar-ap', label: 'A/R & A/P' },
  { href: '/dashboard/sales', label: 'Sales' },
  { href: '/dashboard/invoices', label: 'Invoices' },
  { href: '/dashboard/estimates', label: 'Estimates' },
  { href: '/dashboard/customers', label: 'Customers' },
  { href: '/dashboard/products', label: 'Products' },
  { href: '/dashboard/payments', label: 'Payments' },
  { href: '/dashboard/payroll', label: 'Payroll' },
  { href: '/dashboard/capital', label: 'Capital' },
  { href: '/dashboard/settings', label: 'Settings' },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-steel-700 bg-surface px-3 py-2 md:hidden">
      {items.map((item) => {
        const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium',
              active ? 'bg-brand-600 text-white' : 'bg-steel-700 text-slate-300',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
