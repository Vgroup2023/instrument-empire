CREATE TABLE "crm_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL,
	"kind" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"business" text,
	"contact_id" uuid,
	"deal_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"delivered" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "triage" jsonb;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "priority" integer;--> statement-breakpoint
ALTER TABLE "crm_alerts" ADD CONSTRAINT "crm_alerts_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_alerts" ADD CONSTRAINT "crm_alerts_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_crm_alerts_dedupe" ON "crm_alerts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "ix_crm_alerts_status" ON "crm_alerts" USING btree ("status","created_at");
--> statement-breakpoint
-- Row-level security on every table the earlier migrations left open. The app's own database role skips it; the public
-- Supabase API roles (anon, authenticated) get no access, because no policy allows them any.
ALTER TABLE "app_users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "app_user_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crm_activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crm_contacts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crm_deals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crm_drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crm_reports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crm_targets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crm_alerts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pay_run_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pay_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payroll_profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payroll_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "team_tasks" ENABLE ROW LEVEL SECURITY;
