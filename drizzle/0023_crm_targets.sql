CREATE TABLE "crm_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period" text NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"set_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ux_crm_targets_period_owner" ON "crm_targets" USING btree ("period","owner");