CREATE TABLE "crm_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"deal_id" uuid,
	"channel" text DEFAULT 'email' NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" text DEFAULT 'Follow-up agent' NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"period" date NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "direction" text;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "triaged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN "follow_up_days" integer;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN "do_not_contact" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD COLUMN "last_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_drafts" ADD CONSTRAINT "crm_drafts_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_drafts" ADD CONSTRAINT "crm_drafts_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_crm_drafts_status" ON "crm_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ix_crm_drafts_contact" ON "crm_drafts" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_crm_reports_period" ON "crm_reports" USING btree ("kind","period");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_crm_activities_external" ON "crm_activities" USING btree ("external_id") WHERE external_id is not null;