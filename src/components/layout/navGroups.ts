export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// Single source of truth for the app's navigation, shared by the desktop
// Sidebar and the mobile/tablet drawer so the two can never drift apart
// (the old flat mobile-only list silently fell behind the grouped one for
// several features before this).
export const navGroups: NavGroup[] = [
  {
    title: 'Trade & AI agents',
    items: [
      { href: '/dashboard/agents', label: 'AI agents', icon: '🤖' },
      { href: '/dashboard/shipments', label: 'Shipments', icon: '🚢' },
    ],
  },
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
    items: [
      { href: '/dashboard/settings', label: 'Settings & connection', icon: '⚙️' },
      { href: '/install', label: 'Install the app', icon: '⬇️' },
    ],
  },
];
