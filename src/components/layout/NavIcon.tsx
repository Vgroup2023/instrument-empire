import type { ReactNode } from 'react';

// Outline icons for the menu and the dashboard cards, drawn on a 24 by 24 grid and coloured by the text colour.
const P: Record<string, ReactNode> = {
  doc: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>),
  users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M17 14.2c2.4.2 4 2.2 4 4.8" /></>),
  box: (<><path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9z" /><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" /></>),
  truck: (<><path d="M3 6h11v10H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>),
  chart: <path d="M5 20V11M11 20V4M17 20v-6M3 20h18" />,
  trend: (<><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>),
  wallet: (<><path d="M4 8a2 2 0 0 1 2-2h12v3" /><rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="16.5" cy="14" r="1.2" /></>),
  bank: (<><path d="M3 10 12 4l9 6z" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  calendar: (<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>),
  shield: (<><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></>),
  book: (<><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></>),
  gear: (<><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /></>),
  bot: (<><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V4M9 13h.01M15 13h.01M9 17h6" /></>),
  scale: (<><path d="M12 4v16M6 20h12M5 7h14" /><path d="M5 7 2.5 13a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z" /></>),
  inbox: (<><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></>),
  receipt: (<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>),
  swap: <path d="M4 8h14l-3-3M20 16H6l3 3" />,
  compass: (<><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></>),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  cart: (<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M3 4h2.5l2.2 11h10.6L20.5 8H6.4" /></>),
  search: (<><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>),
  bell: (<><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z" /><path d="M10 21h4" /></>),
  alert: (<><path d="M12 4 2.5 20h19z" /><path d="M12 10v4M12 17h.01" /></>),
  cube: (<><path d="M12 3 3.5 7.5v9L12 21l8.5-4.5v-9z" /><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9" /></>),
  home: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
};

/** Which icon each tab uses. Tabs not listed fall back to the emoji in the menu list. */
export const ICON_BY_HREF: Record<string, string> = {
  '/dashboard': 'home',
  '/dashboard/orders': 'inbox',
  '/dashboard/operations': 'compass',
  '/dashboard/agents': 'bot',
  '/dashboard/counsel': 'scale',
  '/dashboard/shipments': 'truck',
  '/dashboard/rfqs': 'doc',
  '/dashboard/quoting-rules': 'gear',
  '/dashboard/ar-ap': 'clock',
  '/dashboard/sales': 'trend',
  '/dashboard/anomalies': 'shield',
  '/dashboard/flux-analysis': 'chart',
  '/dashboard/invoices': 'receipt',
  '/dashboard/estimates': 'doc',
  '/dashboard/customers': 'users',
  '/dashboard/products': 'box',
  '/dashboard/payments': 'wallet',
  '/dashboard/vendors': 'users',
  '/dashboard/bills': 'receipt',
  '/dashboard/bookkeeping': 'bot',
  '/dashboard/accounts': 'book',
  '/dashboard/journal-entries': 'book',
  '/dashboard/audit-log': 'shield',
  '/dashboard/expenses': 'wallet',
  '/dashboard/transfers': 'swap',
  '/dashboard/reconciliation': 'shield',
  '/dashboard/tax': 'bank',
  '/dashboard/time': 'clock',
  '/dashboard/schedule': 'calendar',
  '/dashboard/pbj': 'doc',
  '/dashboard/pay-runs': 'wallet',
  '/dashboard/payroll': 'users',
  '/dashboard/capital': 'bank',
  '/dashboard/settings': 'gear',
  '/dashboard/files': 'folder',
  '/dashboard/guide': 'book',
  '/install': 'download',
};

export function NavIcon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  const body = P[name];
  if (!body) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      {body}
    </svg>
  );
}
