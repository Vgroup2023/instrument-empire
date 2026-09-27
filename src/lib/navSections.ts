export interface NavSection {
  href: string;
  title: string;
  description: string;
  icon: string;
}

// Single source of truth for "every section of the app" — used by the
// dashboard home hub (quick-access tiles) and can be reused anywhere else
// that needs the full list of destinations.
export const navSections: NavSection[] = [
  {
    href: '/dashboard',
    title: 'Financial insights',
    description: 'Profitability, cash flow, balance sheet health, and industry benchmarking.',
    icon: '📊',
  },
  {
    href: '/dashboard/ar-ap',
    title: 'A/R & A/P aging',
    description: 'Who owes you money, and which bills are coming due.',
    icon: '⏱️',
  },
  {
    href: '/dashboard/sales',
    title: 'Sales breakdown',
    description: "What's driving revenue, by customer and by product.",
    icon: '📈',
  },
  {
    href: '/dashboard/invoices',
    title: 'Invoices',
    description: 'Create, send, duplicate, and schedule customer invoices.',
    icon: '🧾',
  },
  {
    href: '/dashboard/estimates',
    title: 'Estimates',
    description: 'Create, send, duplicate, and schedule customer estimates.',
    icon: '📝',
  },
  {
    href: '/dashboard/customers',
    title: 'Customers',
    description: 'Everyone you bill, all in one place.',
    icon: '👥',
  },
  {
    href: '/dashboard/products',
    title: 'Products & services',
    description: 'What you sell — used as line items on invoices and estimates.',
    icon: '📦',
  },
  {
    href: '/dashboard/payments',
    title: 'Payment links & reminders',
    description: 'Get paid faster with payment links and overdue reminders.',
    icon: '🔗',
  },
  {
    href: '/dashboard/payroll',
    title: 'Payroll',
    description: 'Employee directory, hire status, and base pay.',
    icon: '💼',
  },
  {
    href: '/dashboard/capital',
    title: 'QuickBooks Capital',
    description: 'Your loans and how you compare to peer businesses.',
    icon: '🏦',
  },
  {
    href: '/dashboard/settings',
    title: 'Settings & connection',
    description: 'Manage your QuickBooks Online connection.',
    icon: '⚙️',
  },
];
