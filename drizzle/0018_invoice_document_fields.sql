ALTER TABLE "invoices" ADD COLUMN "po_number" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "bill_to_address" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ship_to" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "template" text DEFAULT 'pro-forma' NOT NULL;