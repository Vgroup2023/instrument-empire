CREATE TYPE "public"."rfq_status" AS ENUM('estimator_review', 'approved', 'returned', 'declined', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "material_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material" text NOT NULL,
	"vendor" text NOT NULL,
	"price" numeric(14, 4) NOT NULL,
	"unit" text DEFAULT 'LB' NOT NULL,
	"price_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prior_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"part_number" text,
	"description" text NOT NULL,
	"customer_name" text,
	"material" text,
	"operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"labor_hours_per_part" numeric(10, 4),
	"material_cost_per_part" numeric(14, 4),
	"unit_price" numeric(14, 4),
	"completed_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"target_margin_pct" numeric(6, 2) DEFAULT '28' NOT NULL,
	"overhead_pct" numeric(6, 2) DEFAULT '12' NOT NULL,
	"scrap_pct" numeric(6, 2) DEFAULT '5' NOT NULL,
	"price_stale_days" integer DEFAULT 30 NOT NULL,
	"min_lead_days" integer DEFAULT 10 NOT NULL,
	"quote_valid_days" integer DEFAULT 30 NOT NULL,
	"certifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"file_size" integer NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"content_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfq_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"part_number" text,
	"description" text NOT NULL,
	"material" text,
	"qty" integer DEFAULT 1 NOT NULL,
	"operations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weight_lb" numeric(12, 4),
	"finish" text,
	"notes" text,
	"costing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"unit_cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"unit_price" numeric(14, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_number" text NOT NULL,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"contact_email" text,
	"subject" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" "rfq_status" DEFAULT 'estimator_review' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" date,
	"raw_text" text,
	"certifications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_margin_pct" numeric(6, 2),
	"cost_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"price_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimator_notes" text,
	"approved_at" timestamp with time zone,
	"estimate_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"setup_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"run_minutes" numeric(8, 2) DEFAULT '0' NOT NULL,
	"rate_per_hour" numeric(10, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rfq_files" ADD CONSTRAINT "rfq_files_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_parts" ADD CONSTRAINT "rfq_parts_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_rfqs_rfq_number" ON "rfqs" ("rfq_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_rfqs_status" ON "rfqs" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_rfqs_received_at" ON "rfqs" ("received_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_rfq_files_rfq_id" ON "rfq_files" ("rfq_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_rfq_parts_rfq_id" ON "rfq_parts" ("rfq_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_material_prices_material_vendor" ON "material_prices" (lower("material"), lower("vendor"));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_routing_rules_operation" ON "routing_rules" (lower("operation"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_prior_jobs_part_number" ON "prior_jobs" (lower("part_number"));
--> statement-breakpoint
ALTER TABLE "rfq_parts" ADD CONSTRAINT "rfq_parts_qty_positive" CHECK ("qty" > 0);
--> statement-breakpoint
ALTER TABLE "quote_settings" ADD CONSTRAINT "quote_settings_single_row" CHECK ("id" = 1);
