CREATE TYPE "public"."bank_txn_status" AS ENUM('new', 'matched', 'review', 'posting', 'posted', 'ignored');--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"txn_date" date NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"fingerprint" text NOT NULL,
	"merchant_key" text NOT NULL,
	"status" "bank_txn_status" DEFAULT 'new' NOT NULL,
	"suggested_account_id" uuid,
	"suggested_vendor_id" uuid,
	"confidence" integer,
	"source" text,
	"reason" text,
	"matched_ref" text,
	"posted_account_id" uuid,
	"posted_expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookkeeping_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" text NOT NULL,
	"account_id" uuid NOT NULL,
	"vendor_id" uuid,
	"auto_post" boolean DEFAULT false NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_suggested_account_id_accounts_id_fk" FOREIGN KEY ("suggested_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_suggested_vendor_id_vendors_id_fk" FOREIGN KEY ("suggested_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_posted_account_id_accounts_id_fk" FOREIGN KEY ("posted_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_posted_expense_id_expenses_id_fk" FOREIGN KEY ("posted_expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookkeeping_rules" ADD CONSTRAINT "bookkeeping_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookkeeping_rules" ADD CONSTRAINT "bookkeeping_rules_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transactions_fingerprint_idx" ON "bank_transactions" USING btree ("account_id","fingerprint");--> statement-breakpoint
CREATE INDEX "bank_transactions_status_idx" ON "bank_transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bank_transactions_merchant_idx" ON "bank_transactions" USING btree ("merchant_key");