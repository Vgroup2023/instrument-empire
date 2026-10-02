import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  date,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

// This schema is this app's own ledger — the source of truth when running
// standalone (no QuickBooks connection required). QuickBooks stays available
// as an optional, separate integration (see src/lib/quickbooks/*), but
// nothing here depends on it.

export const employmentStatusEnum = pgEnum('employment_status', ['active', 'terminated', 'pending']);
export const payPeriodEnum = pgEnum('pay_period', ['hourly', 'salary-annual']);
export const paymentTypeEnum = pgEnum('payment_type', ['Cash', 'Check', 'CreditCard']);
export const postingTypeEnum = pgEnum('posting_type', ['Debit', 'Credit']);
export const productTypeEnum = pgEnum('product_type', ['Service', 'Inventory', 'NonInventory']);
export const estimateStatusEnum = pgEnum('estimate_status', ['Pending', 'Accepted', 'Rejected', 'Closed']);
export const paymentLinkStatusEnum = pgEnum('payment_link_status', [
  'active',
  'sent',
  'paid',
  'expired',
  'cancelled',
]);
export const recurringDocTypeEnum = pgEnum('recurring_doc_type', ['invoice', 'estimate']);
export const recurringFrequencyEnum = pgEnum('recurring_frequency', ['weekly', 'monthly', 'quarterly', 'yearly']);
export const documentEntityTypeEnum = pgEnum('document_entity_type', [
  'invoice',
  'estimate',
  'customer',
  'product',
  'payment_link',
]);
export const auditLogEntityTypeEnum = pgEnum('audit_log_entity_type', ['journal_entry', 'account']);
export const auditLogActionEnum = pgEnum('audit_log_action', ['create', 'update', 'delete']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Chart of accounts — every other table posts money against a row here.
// ---------------------------------------------------------------------------
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  accountType: text('account_type').notNull(),
  accountSubType: text('account_sub_type'),
  acctNum: text('acct_num'),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Customers / Vendors
// ---------------------------------------------------------------------------
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  companyName: text('company_name'),
  email: text('email'),
  phone: text('phone'),
  currencyCode: text('currency_code').notNull().default('USD'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

export const vendors = pgTable('vendors', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  companyName: text('company_name'),
  email: text('email'),
  phone: text('phone'),
  currencyCode: text('currency_code').notNull().default('USD'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Products & services
// ---------------------------------------------------------------------------
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  type: productTypeEnum('type').notNull().default('Service'),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }),
  qtyOnHand: numeric('qty_on_hand', { precision: 14, scale: 2 }),
  incomeAccountId: uuid('income_account_id').references(() => accounts.id),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Invoices (Accounts Receivable)
// ---------------------------------------------------------------------------
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  docNumber: text('doc_number'),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  txnDate: date('txn_date').notNull(),
  dueDate: date('due_date'),
  billEmail: text('bill_email'),
  currencyCode: text('currency_code').notNull().default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  // Tracked so reminder suggestions can avoid nagging right after one went out.
  lastReminderSentAt: timestamp('last_reminder_sent_at', { withTimezone: true }),
  // Milestone/progress invoicing: a group of invoices created together from
  // one contract value, split by percentage (e.g. "50% deposit", "50% on
  // completion"). Null on an ordinary, one-off invoice.
  milestoneGroupId: uuid('milestone_group_id'),
  milestoneLabel: text('milestone_label'),
  ...timestamps,
});

export const invoiceLines = pgTable('invoice_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id),
  description: text('description'),
  qty: numeric('qty', { precision: 14, scale: 4 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 4 }).notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  lineNumber: integer('line_number').notNull(),
});

/** A payment received against an invoice — QuickBooks tracked this for us; standalone, this app must. */
export const invoicePayments = pgTable('invoice_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paymentDate: date('payment_date').notNull(),
  depositAccountId: uuid('deposit_account_id')
    .notNull()
    .references(() => accounts.id),
  memo: text('memo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------
export const estimates = pgTable('estimates', {
  id: uuid('id').primaryKey().defaultRandom(),
  docNumber: text('doc_number'),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  txnDate: date('txn_date').notNull(),
  expirationDate: date('expiration_date'),
  billEmail: text('bill_email'),
  status: estimateStatusEnum('status').notNull().default('Pending'),
  ...timestamps,
});

export const estimateLines = pgTable('estimate_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  estimateId: uuid('estimate_id')
    .notNull()
    .references(() => estimates.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id),
  description: text('description'),
  qty: numeric('qty', { precision: 14, scale: 4 }).notNull(),
  unitPrice: numeric('unit_price', { precision: 14, scale: 4 }).notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  lineNumber: integer('line_number').notNull(),
});

// ---------------------------------------------------------------------------
// Bills (Accounts Payable)
// ---------------------------------------------------------------------------
export const bills = pgTable('bills', {
  id: uuid('id').primaryKey().defaultRandom(),
  docNumber: text('doc_number'),
  vendorId: uuid('vendor_id')
    .notNull()
    .references(() => vendors.id),
  txnDate: date('txn_date').notNull(),
  dueDate: date('due_date'),
  currencyCode: text('currency_code').notNull().default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  // AP approval queue: a bill must be approved before it can be paid — a
  // human still clicks Pay when it's actually due, this just adds a
  // deliberate sign-off step and an optional planned pay date ahead of that.
  approved: boolean('approved').notNull().default(false),
  scheduledPaymentDate: date('scheduled_payment_date'),
  ...timestamps,
});

export const billLines = pgTable('bill_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  description: text('description'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  lineNumber: integer('line_number').notNull(),
});

export const billPayments = pgTable('bill_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  billId: uuid('bill_id')
    .notNull()
    .references(() => bills.id, { onDelete: 'cascade' }),
  vendorId: uuid('vendor_id')
    .notNull()
    .references(() => vendors.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paymentDate: date('payment_date').notNull(),
  bankAccountId: uuid('bank_account_id')
    .notNull()
    .references(() => accounts.id),
  currencyCode: text('currency_code').notNull().default('USD'),
  exchangeRate: numeric('exchange_rate', { precision: 14, scale: 6 }).notNull().default('1'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Journal entries — manual double-entry postings.
// ---------------------------------------------------------------------------
export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  txnDate: date('txn_date').notNull(),
  privateNote: text('private_note'),
  ...timestamps,
});

export const journalLines = pgTable('journal_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  journalEntryId: uuid('journal_entry_id')
    .notNull()
    .references(() => journalEntries.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  postingType: postingTypeEnum('posting_type').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  description: text('description'),
  lineNumber: integer('line_number').notNull(),
});

// ---------------------------------------------------------------------------
// Expenses (Purchases) — paid immediately, as opposed to a Bill.
// ---------------------------------------------------------------------------
export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  docNumber: text('doc_number'),
  txnDate: date('txn_date').notNull(),
  paymentAccountId: uuid('payment_account_id')
    .notNull()
    .references(() => accounts.id),
  paymentType: paymentTypeEnum('payment_type').notNull().default('CreditCard'),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  ...timestamps,
});

export const expenseLines = pgTable('expense_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  expenseId: uuid('expense_id')
    .notNull()
    .references(() => expenses.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  description: text('description'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  lineNumber: integer('line_number').notNull(),
});

// ---------------------------------------------------------------------------
// Transfers — moving money between two of the company's own accounts.
// ---------------------------------------------------------------------------
export const transfers = pgTable('transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  txnDate: date('txn_date').notNull(),
  fromAccountId: uuid('from_account_id')
    .notNull()
    .references(() => accounts.id),
  toAccountId: uuid('to_account_id')
    .notNull()
    .references(() => accounts.id),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  memo: text('memo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Payroll — this app's own employee directory (no QuickBooks Payroll product
// access implied; see src/lib/quickbooks/payroll.ts for that optional path).
// ---------------------------------------------------------------------------
export const payrollEmployees = pgTable('payroll_employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  email: text('email'),
  jobTitle: text('job_title'),
  department: text('department'),
  hiredDate: date('hired_date').notNull(),
  status: employmentStatusEnum('status').notNull().default('active'),
  basePayAmount: numeric('base_pay_amount', { precision: 14, scale: 2 }).notNull(),
  basePayPeriod: payPeriodEnum('base_pay_period').notNull(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Payment links — this app's own record of a link offered to a customer.
// ---------------------------------------------------------------------------
export const paymentLinks = pgTable('payment_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  customerName: text('customer_name').notNull(),
  email: text('email'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  description: text('description'),
  status: paymentLinkStatusEnum('status').notNull().default('active'),
  url: text('url').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Recurring invoice/estimate schedules.
// ---------------------------------------------------------------------------
export const recurringTemplates = pgTable('recurring_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  docType: recurringDocTypeEnum('doc_type').notNull(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customers.id),
  customerName: text('customer_name').notNull(),
  email: text('email'),
  /** Snapshot of line items to recreate on each run — kept as JSON since it mirrors LineItemInput[], not its own relational entity. */
  lines: text('lines_json').notNull(),
  frequency: recurringFrequencyEnum('frequency').notNull(),
  startDate: date('start_date').notNull(),
  nextRunDate: date('next_run_date').notNull(),
  autoSend: boolean('auto_send').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastRunDate: date('last_run_date'),
  lastCreatedDocId: uuid('last_created_doc_id'),
  lastError: text('last_error'),
});

// ---------------------------------------------------------------------------
// Documents — files uploaded and attached to a specific record (an invoice,
// estimate, customer, product, or payment link). Stored directly in this
// app's own database (base64-encoded) rather than a separate object-storage
// service, so no extra credentials/setup are needed beyond DATABASE_URL.
// Meant for typical supporting documents (contracts, receipts, spec sheets),
// not large media files — see the file-size cap in src/lib/accounting/documents.ts.
// ---------------------------------------------------------------------------
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: documentEntityTypeEnum('entity_type').notNull(),
  // Null means a general document for this entity type, not tied to one record —
  // lets the Documents button work from the tab itself even before any rows exist.
  entityId: uuid('entity_id'),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  fileSize: integer('file_size').notNull(),
  contentBase64: text('content_base64').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Audit log — a change-history trail for month-end/audit review: what
// changed, the before/after snapshot, and when. There's a single shared
// login for this app (no individual user accounts), so this deliberately
// doesn't try to record "who" — only "what" and "when", which is still real
// value for reviewing what happened to the ledger before period close.
// ---------------------------------------------------------------------------
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityType: auditLogEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  action: auditLogActionEnum('action').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Trade operations + AI agents (shipments the agents watch, and what they find)
// ---------------------------------------------------------------------------
export const shipmentDirectionEnum = pgEnum('shipment_direction', ['import', 'export']);
export const shipmentStatusEnum = pgEnum('shipment_status', ['open', 'completed', 'cancelled']);
export const agentFindingStatusEnum = pgEnum('agent_finding_status', ['open', 'resolved', 'dismissed']);

export const shipments = pgTable('shipments', {
  id: uuid('id').primaryKey().defaultRandom(),
  reference: text('reference').notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  direction: shipmentDirectionEnum('direction').notNull().default('import'),
  status: shipmentStatusEnum('status').notNull().default('open'),
  originCountry: text('origin_country'),
  destinationCountry: text('destination_country'),
  shipper: text('shipper'),
  consignee: text('consignee'),
  // Foreign port of loading date for imports, US port of export for exports.
  loadingDate: date('loading_date'),
  arrivalDate: date('arrival_date'),
  isfFiledAt: timestamp('isf_filed_at', { withTimezone: true }),
  entryFiledAt: timestamp('entry_filed_at', { withTimezone: true }),
  eeiFiledAt: timestamp('eei_filed_at', { withTimezone: true }),
  invoicedAt: timestamp('invoiced_at', { withTimezone: true }),
  // Document types on file, e.g. ["commercial_invoice","packing_list"].
  receivedDocs: jsonb('received_docs').$type<string[]>().notNull().default([]),
  declaredValue: numeric('declared_value', { precision: 14, scale: 2 }),
  // Logistics: who is moving it and when the free time on the container ends.
  carrier: text('carrier'),
  containerNo: text('container_no'),
  lastFreeDate: date('last_free_date'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  ...timestamps,
});

export const shipmentLines = pgTable('shipment_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  shipmentId: uuid('shipment_id')
    .notNull()
    .references(() => shipments.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  htsCode: text('hts_code'),
  quantity: numeric('quantity', { precision: 14, scale: 2 }),
  value: numeric('value', { precision: 14, scale: 2 }),
  eccn: text('eccn'),
  ...timestamps,
});

// Timeline of what happened to a shipment, entered by staff or pushed in by a
// carrier / TMS / WMS through /api/integrations/events.
export const shipmentEvents = pgTable('shipment_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  shipmentId: uuid('shipment_id')
    .notNull()
    .references(() => shipments.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  location: text('location'),
  note: text('note'),
  source: text('source').notNull().default('manual'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Warehouse receipt for a shipment: what was expected, what arrived, where it
// sits, and the storage terms used to bill after the free days.
export const warehouseReceipts = pgTable('warehouse_receipts', {
  id: uuid('id').primaryKey().defaultRandom(),
  shipmentId: uuid('shipment_id')
    .notNull()
    .unique()
    .references(() => shipments.id, { onDelete: 'cascade' }),
  binLocation: text('bin_location'),
  expectedPieces: integer('expected_pieces'),
  receivedPieces: integer('received_pieces'),
  damagedPieces: integer('damaged_pieces').notNull().default(0),
  receivedAt: timestamp('received_at', { withTimezone: true }),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  freeDays: integer('free_days').notNull().default(5),
  dailyRate: numeric('daily_rate', { precision: 10, scale: 2 }),
  storageBilledAt: timestamp('storage_billed_at', { withTimezone: true }),
  ...timestamps,
});

export const restrictedParties = pgTable('restricted_parties', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  listName: text('list_name').notNull().default('Internal'),
  ...timestamps,
});

export const agentFindings = pgTable('agent_findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  agent: text('agent').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  shipmentId: uuid('shipment_id').references(() => shipments.id, { onDelete: 'cascade' }),
  // Stable key so a repeat run updates the same finding instead of duplicating it.
  dedupeKey: text('dedupe_key').notNull().unique(),
  // Which team owns the follow-up: customs, compliance, shipping, logistics, warehouse or accounts.
  department: text('department').notNull().default('customs'),
  // Optional one-click action, e.g. { type: 'apply_hts', lineId, htsCode } or { type: 'link', href }.
  action: jsonb('action').$type<Record<string, string> | null>(),
  status: agentFindingStatusEnum('status').notNull().default('open'),
  ...timestamps,
});

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  agent: text('agent').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  findingsCount: integer('findings_count').notNull().default(0),
  error: text('error'),
});
