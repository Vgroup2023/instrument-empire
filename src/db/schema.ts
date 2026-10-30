import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  date,
  time,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
  // What the printed invoice shows besides the lines: the customer's PO/SO number, the bill-to and ship-to blocks,
  // payment terms, notes/terms, and which layout (pro-forma or classic) it prints in.
  poNumber: text('po_number'),
  billToAddress: text('bill_to_address'),
  shipTo: text('ship_to'),
  paymentTerms: text('payment_terms'),
  notes: text('notes'),
  template: text('template').notNull().default('pro-forma'),
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
export const payrollEmployees = pgTable(
  'payroll_employees',
  {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  email: text('email'),
  jobTitle: text('job_title'),
  department: text('department'),
  hiredDate: date('hired_date').notNull(),
  status: employmentStatusEnum('status').notNull().default('active'),
  basePayAmount: numeric('base_pay_amount', { precision: 14, scale: 2 }).notNull(),
  basePayPeriod: payPeriodEnum('base_pay_period').notNull(),
  // Time clock and Payroll Based Journal. staff_code is the ID used at the clock and in the PBJ file: unique, never an SSN.
  staffCode: text('staff_code'),
  pbjJobTitleCode: integer('pbj_job_title_code'),
  pbjPayTypeCode: integer('pbj_pay_type_code'),
  terminationDate: date('termination_date'),
  clockPinHash: text('clock_pin_hash'),
  pinFailures: integer('pin_failures').notNull().default(0),
  pinLockedUntil: timestamp('pin_locked_until', { withTimezone: true }),
  ...timestamps,
  },
  (t) => [uniqueIndex('ux_payroll_employees_staff_code').on(t.staffCode)],
);

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
  // Cached HTS Oracle suggestion, keyed by a hash of the description so it is
  // only recomputed when the description changes.
  htsSuggestion: jsonb('hts_suggestion').$type<Record<string, unknown> | null>(),
  htsSuggestionKey: text('hts_suggestion_key'),
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

// ---------------------------------------------------------------------------
// Customer service desk: order intake, customer service, order processing and
// shipping processing. Agents move orders along and log everything they do.
// ---------------------------------------------------------------------------
export const orderStatusEnum = pgEnum('order_status', [
  'received',
  'parsing',
  'needs_review',
  'confirmed',
  'on_hold',
  'processing',
  'ready_to_ship',
  'shipped',
  'delivered',
  'cancelled',
]);
export const serviceMessageStatusEnum = pgEnum('service_message_status', [
  'open',
  'handling',
  'auto_replied',
  'awaiting_approval',
  'escalated',
  'closed',
]);

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderNumber: text('order_number').notNull().unique(),
  channel: text('channel').notNull().default('manual'),
  status: orderStatusEnum('status').notNull().default('received'),
  customerId: uuid('customer_id').references(() => customers.id),
  customerName: text('customer_name'),
  customerEmail: text('customer_email'),
  poNumber: text('po_number'),
  shipLine1: text('ship_line1'),
  shipCity: text('ship_city'),
  shipRegion: text('ship_region'),
  shipPostal: text('ship_postal'),
  shipCountry: text('ship_country'),
  // The original message or payload, kept so a person can check the agent's reading.
  rawText: text('raw_text'),
  currency: text('currency').notNull().default('USD'),
  total: numeric('total', { precision: 14, scale: 2 }),
  // Why the order is waiting on a person or on stock.
  holdReason: text('hold_reason'),
  shippingMethod: text('shipping_method'),
  shipByDate: date('ship_by_date'),
  carrier: text('carrier'),
  trackingNo: text('tracking_no'),
  shippedAt: timestamp('shipped_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  ...timestamps,
});

export const orderLines = pgTable('order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  sku: text('sku'),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: numeric('unit_price', { precision: 14, scale: 2 }),
  productId: uuid('product_id').references(() => products.id),
  // Set once stock has been taken for this line, so a cancel can give it back.
  reservedQty: integer('reserved_qty').notNull().default(0),
});

export const serviceMessages = pgTable('service_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  fromEmail: text('from_email').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  channel: text('channel').notNull().default('manual'),
  intent: text('intent'),
  status: serviceMessageStatusEnum('status').notNull().default('open'),
  replyDraft: text('reply_draft'),
  repliedAt: timestamp('replied_at', { withTimezone: true }),
  handledBy: text('handled_by'),
  // Why the agent did not answer on its own.
  escalationReason: text('escalation_reason'),
  ...timestamps,
});

export const orderEvents = pgTable('order_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').references(() => serviceMessages.id, { onDelete: 'cascade' }),
  agent: text('agent').notNull(),
  action: text('action').notNull(),
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Reference data pulled from public sources: the USITC Harmonized Tariff
// Schedule and the trade.gov Consolidated Screening List.
// ---------------------------------------------------------------------------
export const referenceSyncs = pgTable('reference_syncs', {
  id: uuid('id').primaryKey().defaultRandom(),
  dataset: text('dataset').notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  rowCount: integer('row_count').notNull().default(0),
  error: text('error'),
});

export const htsCodes = pgTable('hts_codes', {
  htsno: text('htsno').primaryKey(),
  indent: integer('indent').notNull(),
  description: text('description').notNull(),
  // Parent descriptions joined, so a line like "Other" still says what it is other than.
  path: text('path').notNull(),
  // The general duty rate, taken from the nearest line above that states one.
  general: text('general'),
  special: text('special'),
  other: text('other'),
  units: jsonb('units').$type<string[]>().notNull().default([]),
  chapter: integer('chapter').notNull(),
});

export const screeningEntries = pgTable('screening_entries', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  type: text('type'),
  name: text('name').notNull(),
  altNames: jsonb('alt_names').$type<string[]>().notNull().default([]),
  programs: text('programs'),
});

// Documents read by DocuPilot. The file itself is not kept, only what was read from it.
export const shipmentDocuments = pgTable('shipment_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  shipmentId: uuid('shipment_id')
    .notNull()
    .references(() => shipments.id, { onDelete: 'cascade' }),
  docType: text('doc_type').notNull().default('commercial_invoice'),
  fileName: text('file_name'),
  extracted: jsonb('extracted').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('extracted'),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// RFQ-to-quote. An incoming request for quote is read, costed against the
// shop's own rules, and held for an estimator to approve before anything goes out.
// ---------------------------------------------------------------------------
export const rfqStatusEnum = pgEnum('rfq_status', [
  'estimator_review',
  'approved',
  'returned',
  'declined',
  'won',
  'lost',
]);

// One row: the shop's pricing policy.
export const quoteSettings = pgTable('quote_settings', {
  id: integer('id').primaryKey().default(1),
  targetMarginPct: numeric('target_margin_pct', { precision: 6, scale: 2 }).notNull().default('28'),
  overheadPct: numeric('overhead_pct', { precision: 6, scale: 2 }).notNull().default('12'),
  scrapPct: numeric('scrap_pct', { precision: 6, scale: 2 }).notNull().default('5'),
  // A material price older than this many days is flagged as stale.
  priceStaleDays: integer('price_stale_days').notNull().default(30),
  // Fewest days the shop needs between receiving an order and shipping it.
  minLeadDays: integer('min_lead_days').notNull().default(10),
  quoteValidDays: integer('quote_valid_days').notNull().default(30),
  // Certifications the shop actually holds, e.g. ISO 9001:2015, AS9100D.
  certifications: jsonb('certifications').$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const materialPrices = pgTable('material_prices', {
  id: uuid('id').primaryKey().defaultRandom(),
  material: text('material').notNull(),
  vendor: text('vendor').notNull(),
  price: numeric('price', { precision: 14, scale: 4 }).notNull(),
  unit: text('unit').notNull().default('LB'),
  priceDate: date('price_date').notNull(),
  notes: text('notes'),
  ...timestamps,
});

// How the shop routes work: what an operation costs in setup and run time.
export const routingRules = pgTable('routing_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  operation: text('operation').notNull(),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  setupHours: numeric('setup_hours', { precision: 8, scale: 2 }).notNull().default('0'),
  runMinutes: numeric('run_minutes', { precision: 8, scale: 2 }).notNull().default('0'),
  ratePerHour: numeric('rate_per_hour', { precision: 10, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  ...timestamps,
});

// Job history the quoting engine learns from.
export const priorJobs = pgTable('prior_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  partNumber: text('part_number'),
  description: text('description').notNull(),
  customerName: text('customer_name'),
  material: text('material'),
  operations: jsonb('operations').$type<string[]>().notNull().default([]),
  qty: integer('qty').notNull().default(1),
  laborHoursPerPart: numeric('labor_hours_per_part', { precision: 10, scale: 4 }),
  materialCostPerPart: numeric('material_cost_per_part', { precision: 14, scale: 4 }),
  unitPrice: numeric('unit_price', { precision: 14, scale: 4 }),
  completedOn: date('completed_on'),
  ...timestamps,
});

export const rfqs = pgTable('rfqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  rfqNumber: text('rfq_number').notNull(),
  customerId: uuid('customer_id').references(() => customers.id),
  customerName: text('customer_name').notNull(),
  contactEmail: text('contact_email'),
  subject: text('subject'),
  source: text('source').notNull().default('manual'),
  status: rfqStatusEnum('status').notNull().default('estimator_review'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  dueDate: date('due_date'),
  rawText: text('raw_text'),
  certifications: jsonb('certifications').$type<string[]>().notNull().default([]),
  // Blank means "use the shop's target margin".
  targetMarginPct: numeric('target_margin_pct', { precision: 6, scale: 2 }),
  costTotal: numeric('cost_total', { precision: 14, scale: 2 }).notNull().default('0'),
  priceTotal: numeric('price_total', { precision: 14, scale: 2 }).notNull().default('0'),
  flags: jsonb('flags').$type<unknown[]>().notNull().default([]),
  estimatorNotes: text('estimator_notes'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  estimateId: uuid('estimate_id'),
  ...timestamps,
});

export const rfqFiles = pgTable('rfq_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  rfqId: uuid('rfq_id')
    .notNull()
    .references(() => rfqs.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull().default('application/octet-stream'),
  fileSize: integer('file_size').notNull(),
  kind: text('kind').notNull().default('other'),
  contentBase64: text('content_base64').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rfqParts = pgTable('rfq_parts', {
  id: uuid('id').primaryKey().defaultRandom(),
  rfqId: uuid('rfq_id')
    .notNull()
    .references(() => rfqs.id, { onDelete: 'cascade' }),
  lineNumber: integer('line_number').notNull(),
  partNumber: text('part_number'),
  description: text('description').notNull(),
  material: text('material'),
  qty: integer('qty').notNull().default(1),
  operations: jsonb('operations').$type<string[]>().notNull().default([]),
  // Finished weight per part in pounds. Raw stock is worked out from it plus scrap.
  weightLb: numeric('weight_lb', { precision: 12, scale: 4 }),
  finish: text('finish'),
  notes: text('notes'),
  // The computed breakdown the estimator reviews (see src/lib/quoting/costing.ts).
  costing: jsonb('costing').$type<Record<string, unknown>>().notNull().default({}),
  unitCost: numeric('unit_cost', { precision: 14, scale: 4 }).notNull().default('0'),
  unitPrice: numeric('unit_price', { precision: 14, scale: 4 }).notNull().default('0'),
});

// ---------------------------------------------------------------------------
// AI bookkeeping — statement lines the copilot reads, matches and categorizes.
// Nothing here changes the books until a person approves a line (or a rule the
// person chose to auto-post fires); posting creates an ordinary Expense.
// ---------------------------------------------------------------------------
export const bankTxnStatusEnum = pgEnum('bank_txn_status', ['new', 'matched', 'review', 'posting', 'posted', 'ignored']);

export const bankTransactions = pgTable(
  'bank_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    txnDate: date('txn_date').notNull(),
    description: text('description').notNull(),
    // Signed like a bank statement: money out is negative.
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    // Lets the same statement be uploaded twice without duplicating lines.
    fingerprint: text('fingerprint').notNull(),
    merchantKey: text('merchant_key').notNull(),
    status: bankTxnStatusEnum('status').notNull().default('new'),
    suggestedAccountId: uuid('suggested_account_id').references(() => accounts.id),
    suggestedVendorId: uuid('suggested_vendor_id').references(() => vendors.id),
    confidence: integer('confidence'),
    // rule | history | ai
    source: text('source'),
    reason: text('reason'),
    matchedRef: text('matched_ref'),
    postedAccountId: uuid('posted_account_id').references(() => accounts.id),
    postedExpenseId: uuid('posted_expense_id').references(() => expenses.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('bank_transactions_fingerprint_idx').on(t.accountId, t.fingerprint),
    index('bank_transactions_status_idx').on(t.status),
    index('bank_transactions_merchant_idx').on(t.merchantKey),
  ],
);

export const bookkeepingRules = pgTable('bookkeeping_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Matched against the cleaned-up description, case-insensitively.
  pattern: text('pattern').notNull(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  // Off by default: the line still waits for a person. On means "post it without asking".
  autoPost: boolean('auto_post').notNull().default(false),
  hits: integer('hits').notNull().default(0),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Tax preparation. One row per return being prepared. Only the answers to the interview are stored;
// the amounts are recalculated from them, so a change to the tax tables never leaves a stale figure.
// Social Security and Social Insurance numbers are deliberately never collected here.
// ---------------------------------------------------------------------------
export const taxCountryEnum = pgEnum('tax_country', ['US', 'CA']);
export const taxReturnStatusEnum = pgEnum('tax_return_status', ['draft', 'ready']);

export const taxReturns = pgTable(
  'tax_returns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    country: taxCountryEnum('country').notNull(),
    taxYear: integer('tax_year').notNull(),
    /** What the return is called in the list, e.g. "Jane Doe" or "Acme Ltd owner". */
    title: text('title').notNull(),
    status: taxReturnStatusEnum('status').notNull().default('draft'),
    inputs: jsonb('inputs').$type<Record<string, number | string | boolean>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index('ix_tax_returns_updated_at').on(t.updatedAt)],
);

// ---------------------------------------------------------------------------
// Files library. One row per uploaded file. The bytes live in object storage when it is set up (the browser sends
// and fetches them directly, so the app server never carries them and this table stays small). Without storage,
// small files are kept in `content_base64` so the tab still works. `status` is 'pending' from the moment an upload
// is started until the browser confirms it finished.
// ---------------------------------------------------------------------------
export const fileStatusEnum = pgEnum('file_status', ['pending', 'ready']);

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    /** Where the bytes are: 'storage' (object storage) or 'database' (the fallback). */
    store: text('store').notNull().default('storage'),
    storageKey: text('storage_key'),
    contentBase64: text('content_base64'),
    /** A short free-text label to group files by, e.g. "Customs", "Receipts". */
    label: text('label'),
    status: fileStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ix_files_created_at').on(t.createdAt), index('ix_files_status').on(t.status)],
);

// ---------------------------------------------------------------------------
// Time & attendance and scheduling. A time entry is one stretch of work (clock in, clock out, minutes of meal
// break). work_date is the facility's calendar date for the shift start, so an overnight shift stays on one day.
// Shifts are the plan; time entries are what happened. The Payroll Based Journal report is built from approved
// time entries only, never from the schedule.
// ---------------------------------------------------------------------------
export const timeEntries = pgTable(
  'time_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => payrollEmployees.id),
    workDate: date('work_date').notNull(),
    clockIn: timestamp('clock_in', { withTimezone: true }).notNull(),
    /** Null while the person is still clocked in. */
    clockOut: timestamp('clock_out', { withTimezone: true }),
    mealMinutes: integer('meal_minutes').notNull().default(0),
    /** PBJ job title code worked this shift, when it differs from the person's usual one. */
    jobTitleCode: integer('job_title_code'),
    /** 'clock' (staff clocked in themselves) or 'manual' (entered or corrected by a manager). */
    source: text('source').notNull().default('manual'),
    approved: boolean('approved').notNull().default(false),
    note: text('note'),
    ...timestamps,
  },
  (t) => [
    index('ix_time_entries_employee_date').on(t.employeeId, t.workDate),
    index('ix_time_entries_work_date').on(t.workDate),
    // A person can only be clocked in once: two taps at the same moment cannot open two shifts.
    uniqueIndex('ux_time_entries_one_open').on(t.employeeId).where(sql`${t.clockOut} is null`),
  ],
);

export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null is an open shift nobody has taken yet. */
    employeeId: uuid('employee_id').references(() => payrollEmployees.id),
    shiftDate: date('shift_date').notNull(),
    startTime: time('start_time').notNull(),
    /** At or before start_time means the shift ends the next day. */
    endTime: time('end_time').notNull(),
    jobTitleCode: integer('job_title_code'),
    location: text('location'),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('ix_shifts_date').on(t.shiftDate), index('ix_shifts_employee_date').on(t.employeeId, t.shiftDate)],
);

export const timeOffRequests = pgTable(
  'time_off_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => payrollEmployees.id),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    /** vacation, sick, personal or other. */
    kind: text('kind').notNull().default('vacation'),
    /** pending, approved or denied. */
    status: text('status').notNull().default('pending'),
    note: text('note'),
    ...timestamps,
  },
  (t) => [index('ix_time_off_dates').on(t.startDate, t.endDate)],
);

/** One row (id 1): the facility details the Payroll Based Journal file needs, and the meal break rule. */
export const workforceSettings = pgTable('workforce_settings', {
  id: integer('id').primaryKey().default(1),
  /** CMS certification number (CCN), used as facilityId in the PBJ file. */
  facilityId: text('facility_id'),
  stateCode: text('state_code'),
  /** IANA time zone of the facility, used to turn clock times into the facility's calendar day. */
  timezone: text('timezone').notNull().default('America/New_York'),
  /** Minutes taken off every shift of at least meal_threshold_hours, or the real meal break if longer. */
  mealDeductMinutes: integer('meal_deduct_minutes').notNull().default(30),
  mealThresholdHours: numeric('meal_threshold_hours', { precision: 4, scale: 2 }).notNull().default('6'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Payroll runs. A run pays a set of employees for a pay period. Items hold every figure on the pay stub, stored as
// calculated when the run was finalized, so a stub never changes after the fact. A finalized run posts one journal
// entry (wages and employer taxes in; net pay, tax liabilities and deductions out).
// ---------------------------------------------------------------------------
export const payrollProfiles = pgTable('payroll_profiles', {
  employeeId: uuid('employee_id')
    .primaryKey()
    .references(() => payrollEmployees.id),
  /** single, married (filing jointly) or head (of household), from Form W-4 Step 1(c). */
  filingStatus: text('filing_status').notNull().default('single'),
  step2Checked: boolean('step2_checked').notNull().default(false),
  /** Form W-4 Step 3 (yearly), 4(a) and 4(b) (yearly), 4(c) (each pay period). */
  credits: numeric('credits', { precision: 14, scale: 2 }).notNull().default('0'),
  otherIncome: numeric('other_income', { precision: 14, scale: 2 }).notNull().default('0'),
  deductions: numeric('deductions', { precision: 14, scale: 2 }).notNull().default('0'),
  extraWithholding: numeric('extra_withholding', { precision: 14, scale: 2 }).notNull().default('0'),
  exempt: boolean('exempt').notNull().default(false),
  stateCode: text('state_code'),
  /** What the state form says to hold back: a percent of wages and/or a fixed amount each pay period. */
  statePercent: numeric('state_percent', { precision: 6, scale: 3 }).notNull().default('0'),
  stateFixed: numeric('state_fixed', { precision: 14, scale: 2 }).notNull().default('0'),
  /** Per pay period. */
  pretaxBenefits: numeric('pretax_benefits', { precision: 14, scale: 2 }).notNull().default('0'),
  pretaxRetirement: numeric('pretax_retirement', { precision: 14, scale: 2 }).notNull().default('0'),
  afterTax: numeric('after_tax', { precision: 14, scale: 2 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row (id 1): which accounts payroll posts to, and the employer's state unemployment rate. */
export const payrollSettings = pgTable('payroll_settings', {
  id: integer('id').primaryKey().default(1),
  frequency: text('frequency').notNull().default('biweekly'),
  wagesAccountId: uuid('wages_account_id').references(() => accounts.id),
  employerTaxAccountId: uuid('employer_tax_account_id').references(() => accounts.id),
  taxPayableAccountId: uuid('tax_payable_account_id').references(() => accounts.id),
  deductionsPayableAccountId: uuid('deductions_payable_account_id').references(() => accounts.id),
  payFromAccountId: uuid('pay_from_account_id').references(() => accounts.id),
  /** State unemployment: the employer's rate in percent and the state's wage base per employee per year. */
  sutaRate: numeric('suta_rate', { precision: 6, scale: 3 }).notNull().default('0'),
  sutaWageBase: numeric('suta_wage_base', { precision: 14, scale: 2 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payRuns = pgTable(
  'pay_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    payDate: date('pay_date').notNull(),
    frequency: text('frequency').notNull(),
    /** draft, final or void. */
    status: text('status').notNull().default('draft'),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntries.id),
    reversalEntryId: uuid('reversal_entry_id').references(() => journalEntries.id),
    note: text('note'),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('ix_pay_runs_pay_date').on(t.payDate)],
);

export const payRunItems = pgTable(
  'pay_run_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => payRuns.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => payrollEmployees.id),
    kind: text('kind').notNull(),
    rate: numeric('rate', { precision: 14, scale: 2 }).notNull(),
    regularHours: numeric('regular_hours', { precision: 8, scale: 2 }).notNull().default('0'),
    overtimeHours: numeric('overtime_hours', { precision: 8, scale: 2 }).notNull().default('0'),
    regularPay: numeric('regular_pay', { precision: 14, scale: 2 }).notNull().default('0'),
    overtimePay: numeric('overtime_pay', { precision: 14, scale: 2 }).notNull().default('0'),
    extraPay: numeric('extra_pay', { precision: 14, scale: 2 }).notNull().default('0'),
    gross: numeric('gross', { precision: 14, scale: 2 }).notNull().default('0'),
    pretaxBenefits: numeric('pretax_benefits', { precision: 14, scale: 2 }).notNull().default('0'),
    pretaxRetirement: numeric('pretax_retirement', { precision: 14, scale: 2 }).notNull().default('0'),
    afterTax: numeric('after_tax', { precision: 14, scale: 2 }).notNull().default('0'),
    federal: numeric('federal', { precision: 14, scale: 2 }).notNull().default('0'),
    socialSecurity: numeric('social_security', { precision: 14, scale: 2 }).notNull().default('0'),
    medicare: numeric('medicare', { precision: 14, scale: 2 }).notNull().default('0'),
    additionalMedicare: numeric('additional_medicare', { precision: 14, scale: 2 }).notNull().default('0'),
    state: numeric('state', { precision: 14, scale: 2 }).notNull().default('0'),
    net: numeric('net', { precision: 14, scale: 2 }).notNull().default('0'),
    employerSocialSecurity: numeric('employer_social_security', { precision: 14, scale: 2 }).notNull().default('0'),
    employerMedicare: numeric('employer_medicare', { precision: 14, scale: 2 }).notNull().default('0'),
    futa: numeric('futa', { precision: 14, scale: 2 }).notNull().default('0'),
    suta: numeric('suta', { precision: 14, scale: 2 }).notNull().default('0'),
    /** Wages that count for Social Security, Medicare, FUTA and state unemployment (after Section 125 benefits). */
    ficaWages: numeric('fica_wages', { precision: 14, scale: 2 }).notNull().default('0'),
    note: text('note'),
  },
  (t) => [uniqueIndex('ux_pay_run_items_run_employee').on(t.runId, t.employeeId), index('ix_pay_run_items_employee').on(t.employeeId)],
);

// ---------------------------------------------------------------------------
// CRM: contacts and leads, deals moving through pipeline stages, and an activity log (calls, emails, meetings, notes,
// tasks, and the changes the system records itself). People have no logins here, so owners and actors are plain names.
// ---------------------------------------------------------------------------
export const crmContacts = pgTable(
  'crm_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    company: text('company'),
    jobTitle: text('job_title'),
    email: text('email'),
    phone: text('phone'),
    /** Where the lead came from: website, referral, event, cold outreach, other. */
    source: text('source').notNull().default('other'),
    /** lead, qualified, customer or archived. */
    status: text('status').notNull().default('lead'),
    owner: text('owner'),
    /** Set once the contact is also a customer on the books. */
    customerId: uuid('customer_id').references(() => customers.id),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('ix_crm_contacts_status').on(t.status), index('ix_crm_contacts_customer').on(t.customerId)],
);

export const crmDeals = pgTable(
  'crm_deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    contactId: uuid('contact_id').references(() => crmContacts.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id),
    value: numeric('value', { precision: 14, scale: 2 }).notNull().default('0'),
    currency: text('currency').notNull().default('USD'),
    /** lead, qualified, proposal, negotiation, won or lost. */
    stage: text('stage').notNull().default('lead'),
    expectedClose: date('expected_close'),
    owner: text('owner'),
    source: text('source').notNull().default('other'),
    lostReason: text('lost_reason'),
    /** When the deal was won or lost; null while it is open. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('ix_crm_deals_stage').on(t.stage), index('ix_crm_deals_contact').on(t.contactId), index('ix_crm_deals_updated').on(t.updatedAt)],
);

export const crmActivities = pgTable(
  'crm_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id').references(() => crmDeals.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => crmContacts.id, { onDelete: 'cascade' }),
    /** call, email, meeting, note, task, or a system entry: created, stage, won, lost, customer. */
    kind: text('kind').notNull(),
    summary: text('summary').notNull(),
    detail: text('detail'),
    /** For calls and meetings: how long it ran. */
    durationSeconds: integer('duration_seconds'),
    /** For tasks: when it is due, and when it was done. */
    dueAt: timestamp('due_at', { withTimezone: true }),
    doneAt: timestamp('done_at', { withTimezone: true }),
    actor: text('actor').notNull().default('Office team'),
    ...timestamps,
  },
  (t) => [
    index('ix_crm_activities_deal').on(t.dealId),
    index('ix_crm_activities_contact').on(t.contactId),
    index('ix_crm_activities_created').on(t.createdAt),
    index('ix_crm_activities_updated').on(t.updatedAt),
  ],
);
