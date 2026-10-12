-- Integrity and speed: indexes on every foreign key / date column the tabs filter and join on,
-- plus constraints that stop bad rows at the database. Written to be safe on live data:
--   * every statement is IF NOT EXISTS / guarded, so re-running does nothing;
--   * unique indexes are only created when no duplicates exist (otherwise a NOTICE is raised);
--   * CHECK constraints are NOT VALID, so they guard every new/updated row without failing on old ones.

CREATE INDEX IF NOT EXISTS "ix_invoices_customer_id" ON "invoices" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_invoices_txn_date" ON "invoices" ("txn_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_invoice_lines_invoice_id" ON "invoice_lines" ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_invoice_lines_product_id" ON "invoice_lines" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_invoice_payments_invoice_id" ON "invoice_payments" ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_invoice_payments_payment_date" ON "invoice_payments" ("payment_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_invoice_payments_deposit_account_id" ON "invoice_payments" ("deposit_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_estimates_customer_id" ON "estimates" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_estimates_txn_date" ON "estimates" ("txn_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_estimate_lines_estimate_id" ON "estimate_lines" ("estimate_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bills_vendor_id" ON "bills" ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bills_txn_date" ON "bills" ("txn_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bill_lines_bill_id" ON "bill_lines" ("bill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bill_lines_account_id" ON "bill_lines" ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bill_payments_bill_id" ON "bill_payments" ("bill_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bill_payments_payment_date" ON "bill_payments" ("payment_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bill_payments_vendor_id" ON "bill_payments" ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bill_payments_bank_account_id" ON "bill_payments" ("bank_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_journal_entries_txn_date" ON "journal_entries" ("txn_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_journal_lines_journal_entry_id" ON "journal_lines" ("journal_entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_journal_lines_account_id" ON "journal_lines" ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_expenses_txn_date" ON "expenses" ("txn_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_expenses_vendor_id" ON "expenses" ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_expenses_payment_account_id" ON "expenses" ("payment_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_expense_lines_expense_id" ON "expense_lines" ("expense_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_expense_lines_account_id" ON "expense_lines" ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_transfers_txn_date" ON "transfers" ("txn_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_transfers_from_account_id" ON "transfers" ("from_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_transfers_to_account_id" ON "transfers" ("to_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_products_income_account_id" ON "products" ("income_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_payment_links_customer_id" ON "payment_links" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_recurring_templates_customer_id" ON "recurring_templates" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_recurring_templates_next_run_date" ON "recurring_templates" ("next_run_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_documents_entity_type_entity_id" ON "documents" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_audit_log_entity_type_created_at" ON "audit_log" ("entity_type", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_shipments_customer_id" ON "shipments" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_shipments_status" ON "shipments" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_shipment_lines_shipment_id" ON "shipment_lines" ("shipment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_shipment_events_shipment_id" ON "shipment_events" ("shipment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_agent_findings_shipment_id" ON "agent_findings" ("shipment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_order_lines_order_id" ON "order_lines" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_order_events_order_id" ON "order_events" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_order_events_message_id" ON "order_events" ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_service_messages_order_id" ON "service_messages" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_service_messages_status" ON "service_messages" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_orders_status" ON "orders" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_orders_customer_id" ON "orders" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_shipment_documents_shipment_id" ON "shipment_documents" ("shipment_id");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_invoices_doc_number') THEN
    NULL;
  ELSIF EXISTS (SELECT "doc_number" FROM "invoices" WHERE "doc_number" IS NOT NULL GROUP BY "doc_number" HAVING count(*) > 1) THEN
    RAISE NOTICE 'Skipped ux_invoices_doc_number: duplicate values already exist in invoices; clean them up and re-run.';
  ELSE
    CREATE UNIQUE INDEX "ux_invoices_doc_number" ON "invoices" ("doc_number") WHERE "doc_number" IS NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_estimates_doc_number') THEN
    NULL;
  ELSIF EXISTS (SELECT "doc_number" FROM "estimates" WHERE "doc_number" IS NOT NULL GROUP BY "doc_number" HAVING count(*) > 1) THEN
    RAISE NOTICE 'Skipped ux_estimates_doc_number: duplicate values already exist in estimates; clean them up and re-run.';
  ELSE
    CREATE UNIQUE INDEX "ux_estimates_doc_number" ON "estimates" ("doc_number") WHERE "doc_number" IS NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_bills_doc_number') THEN
    NULL;
  ELSIF EXISTS (SELECT "doc_number" FROM "bills" WHERE "doc_number" IS NOT NULL GROUP BY "doc_number" HAVING count(*) > 1) THEN
    RAISE NOTICE 'Skipped ux_bills_doc_number: duplicate values already exist in bills; clean them up and re-run.';
  ELSE
    CREATE UNIQUE INDEX "ux_bills_doc_number" ON "bills" ("doc_number") WHERE "doc_number" IS NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_expenses_doc_number') THEN
    NULL;
  ELSIF EXISTS (SELECT "doc_number" FROM "expenses" WHERE "doc_number" IS NOT NULL GROUP BY "doc_number" HAVING count(*) > 1) THEN
    RAISE NOTICE 'Skipped ux_expenses_doc_number: duplicate values already exist in expenses; clean them up and re-run.';
  ELSE
    CREATE UNIQUE INDEX "ux_expenses_doc_number" ON "expenses" ("doc_number") WHERE "doc_number" IS NOT NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_accounts_acct_num') THEN
    NULL;
  ELSIF EXISTS (SELECT lower("acct_num") FROM "accounts" WHERE "acct_num" IS NOT NULL AND "acct_num" <> '' GROUP BY lower("acct_num") HAVING count(*) > 1) THEN
    RAISE NOTICE 'Skipped ux_accounts_acct_num: duplicate values already exist in accounts; clean them up and re-run.';
  ELSE
    CREATE UNIQUE INDEX "ux_accounts_acct_num" ON "accounts" (lower("acct_num")) WHERE "acct_num" IS NOT NULL AND "acct_num" <> '';
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ux_shipments_reference') THEN
    NULL;
  ELSIF EXISTS (SELECT lower("reference") FROM "shipments" WHERE true GROUP BY lower("reference") HAVING count(*) > 1) THEN
    RAISE NOTICE 'Skipped ux_shipments_reference: duplicate values already exist in shipments; clean them up and re-run.';
  ELSE
    CREATE UNIQUE INDEX "ux_shipments_reference" ON "shipments" (lower("reference")) WHERE true;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_amount_positive') THEN
    ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_amount_positive" CHECK ("amount" > 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_payments_amount_positive') THEN
    ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_amount_positive" CHECK ("amount" > 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_payments_amount_positive') THEN
    ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_amount_positive" CHECK ("amount" > 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_amount_positive') THEN
    ALTER TABLE "transfers" ADD CONSTRAINT "transfers_amount_positive" CHECK ("amount" > 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transfers_distinct_accounts') THEN
    ALTER TABLE "transfers" ADD CONSTRAINT "transfers_distinct_accounts" CHECK ("from_account_id" <> "to_account_id") NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_lines_nonnegative') THEN
    ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_nonnegative" CHECK ("qty" > 0 AND "unit_price" >= 0 AND "amount" >= 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estimate_lines_nonnegative') THEN
    ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_nonnegative" CHECK ("qty" > 0 AND "unit_price" >= 0 AND "amount" >= 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bill_lines_amount_positive') THEN
    ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_amount_positive" CHECK ("amount" > 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_amount_positive') THEN
    ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_amount_positive" CHECK ("amount" > 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_links_amount_positive') THEN
    ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_amount_positive" CHECK ("amount" > 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_pay_nonnegative') THEN
    ALTER TABLE "payroll_employees" ADD CONSTRAINT "payroll_pay_nonnegative" CHECK ("base_pay_amount" >= 0) NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_lines_quantity_positive') THEN
    ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_quantity_positive" CHECK ("quantity" > 0 AND "reserved_qty" >= 0) NOT VALID;
  END IF;
END $$;
