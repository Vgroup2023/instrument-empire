// Keyboard shortcuts for moving around the app. "g" then a letter goes to a page, like Gmail and GitHub.
// Pure data, so a test can check every address points at a real page.

export const GO_SHORTCUTS: { key: string; href: string; label: string }[] = [
  { key: 'd', href: '/dashboard', label: 'Overview' },
  { key: 'i', href: '/dashboard/invoices', label: 'Invoices' },
  { key: 'e', href: '/dashboard/estimates', label: 'Estimates' },
  { key: 'c', href: '/dashboard/customers', label: 'Customers' },
  { key: 'p', href: '/dashboard/products', label: 'Products & services' },
  { key: 'y', href: '/dashboard/payments', label: 'Payment links & reminders' },
  { key: 'v', href: '/dashboard/vendors', label: 'Vendors' },
  { key: 'b', href: '/dashboard/bills', label: 'Bills' },
  { key: 'k', href: '/dashboard/bookkeeping', label: 'AI bookkeeping' },
  { key: 'a', href: '/dashboard/accounts', label: 'Chart of accounts' },
  { key: 'j', href: '/dashboard/journal-entries', label: 'Journal entries' },
  { key: 'x', href: '/dashboard/expenses', label: 'Expenses' },
  { key: 't', href: '/dashboard/transfers', label: 'Transfers' },
  { key: 'r', href: '/dashboard/reconciliation', label: 'Reconciliation' },
  { key: 'u', href: '/dashboard/tax', label: 'Tax filing' },
  { key: 'm', href: '/dashboard/payroll', label: 'Payroll' },
  { key: '1', href: '/dashboard/time', label: 'Time & attendance' },
  { key: '2', href: '/dashboard/schedule', label: 'Scheduling' },
  { key: '3', href: '/dashboard/pbj', label: 'Payroll Based Journal' },
  { key: 'o', href: '/dashboard/orders', label: 'Order desk' },
  { key: 'w', href: '/dashboard/operations', label: 'Operations board' },
  { key: 's', href: '/dashboard/shipments', label: 'Shipments' },
  { key: 'q', href: '/dashboard/rfqs', label: 'RFQs to quotes' },
  { key: 'g', href: '/dashboard/agents', label: 'AI agents' },
  { key: 'n', href: '/dashboard/counsel', label: 'Counsel (AI lawyer)' },
  { key: 'l', href: '/dashboard/audit-log', label: 'Audit log' },
  { key: 'f', href: '/dashboard/files', label: 'Files' },
  { key: 'h', href: '/dashboard/guide', label: 'Training guide' },
  { key: 'z', href: '/dashboard/settings', label: 'Settings & connection' },
];

export const OTHER_SHORTCUTS: { keys: string; label: string }[] = [
  { keys: 'Ctrl/⌘ K  or  /', label: 'Search every page and jump to it' },
  { keys: 'N', label: 'New: the main "+" button on the page' },
  { keys: '?', label: 'Show this list' },
  { keys: 'Esc', label: 'Close a window or this list' },
];

export const GO_BY_KEY = new Map(GO_SHORTCUTS.map((s) => [s.key, s]));

/** True when the key press is going into a field, so a shortcut must not fire. */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}
