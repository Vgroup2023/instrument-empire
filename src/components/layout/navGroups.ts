export type DemoProvider = 'payments' | 'payroll' | 'capital' | 'benchmark';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** One line shown on the master dashboard tile. */
  description: string;
  /** Runs on sample data until this provider is switched to live in the environment. */
  demoProvider?: DemoProvider;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// Single source of truth for the app's navigation. The desktop Sidebar, the
// mobile drawer and the master dashboard's tab grid all read this list, so a
// page added here shows up in all three and cannot be forgotten in one.
// scripts/check-nav.mjs fails CI if a dashboard page is missing from it.
export const navGroups: NavGroup[] = [
  {
    title: 'Trade & AI agents',
    items: [
      { href: '/dashboard/orders', label: 'Order desk', icon: '📬', description: 'Order intake, customer replies, processing and shipping, run by four agents.' },
      { href: '/dashboard/operations', label: 'Operations board', icon: '🧭', description: 'Every shipment by stage, with open work for each department.' },
      { href: '/dashboard/agents', label: 'AI agents', icon: '🤖', description: 'Six trade agents, their findings, and the restricted-party list.' },
      { href: '/dashboard/shipments', label: 'Shipments', icon: '🚢', description: 'Files, filings, documents, logistics and warehouse receipts.' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/dashboard', label: 'Overview', icon: '📊', description: 'Profitability, cash flow and balance sheet health.' },
      { href: '/dashboard/ar-ap', label: 'A/R & A/P aging', icon: '⏱️', description: 'Who owes you money, and which bills are coming due.' },
      { href: '/dashboard/sales', label: 'Sales breakdown', icon: '📈', description: "What's driving revenue, by customer and by product." },
      { href: '/dashboard/anomalies', label: 'Anomaly detection', icon: '🚨', description: 'Duplicates, unusual amounts and unbalanced entries in your ledger.' },
      { href: '/dashboard/flux-analysis', label: 'Flux analysis', icon: '📐', description: 'What changed between periods, line by line.' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { href: '/dashboard/invoices', label: 'Invoices', icon: '🧾', description: 'Create, send, duplicate and schedule customer invoices.' },
      { href: '/dashboard/estimates', label: 'Estimates', icon: '📝', description: 'Create, send, duplicate and schedule customer estimates.' },
      { href: '/dashboard/customers', label: 'Customers', icon: '👥', description: 'Everyone you bill, all in one place.' },
      { href: '/dashboard/products', label: 'Products & services', icon: '📦', description: 'What you sell, used on invoices, estimates and orders.' },
      { href: '/dashboard/payments', label: 'Payment links & reminders', icon: '🔗', description: 'Get paid faster with payment links and overdue reminders.', demoProvider: 'payments' },
    ],
  },
  {
    title: 'Payables',
    items: [
      { href: '/dashboard/vendors', label: 'Vendors', icon: '🏭', description: 'Everyone you owe money to.' },
      { href: '/dashboard/bills', label: 'Bills', icon: '🧮', description: 'Enter, approve and pay vendor bills.' },
    ],
  },
  {
    title: 'Accounting',
    items: [
      { href: '/dashboard/accounts', label: 'Chart of accounts', icon: '📚', description: 'Your accounts and their balances.' },
      { href: '/dashboard/journal-entries', label: 'Journal entries', icon: '📒', description: 'Post and review manual entries.' },
      { href: '/dashboard/audit-log', label: 'Audit log', icon: '🕵️', description: 'What changed in the books, and when.' },
    ],
  },
  {
    title: 'Banking',
    items: [
      { href: '/dashboard/expenses', label: 'Expenses', icon: '💳', description: 'Record spending by category.' },
      { href: '/dashboard/transfers', label: 'Transfers', icon: '🔁', description: 'Move money between your accounts.' },
      { href: '/dashboard/reconciliation', label: 'Reconciliation', icon: '🧾', description: 'Match your books to the bank statement.' },
    ],
  },
  {
    title: 'People & money',
    items: [
      { href: '/dashboard/payroll', label: 'Payroll', icon: '💼', description: 'Employee directory, hire status and base pay.', demoProvider: 'payroll' },
      { href: '/dashboard/capital', label: 'QuickBooks Capital', icon: '🏦', description: 'Your loans and how you compare to peer businesses.', demoProvider: 'capital' },
    ],
  },
  {
    title: 'App',
    items: [
      { href: '/dashboard/settings', label: 'Settings & connection', icon: '⚙️', description: 'Optional QuickBooks connection and provider status.' },
      { href: '/dashboard/guide', label: 'Training guide', icon: '📖', description: 'How to use every tab. Read it here or download the Word file.' },
      { href: '/install', label: 'Install the app', icon: '⬇️', description: 'Add GloblexAI Office ERP to your desktop or phone.' },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);
