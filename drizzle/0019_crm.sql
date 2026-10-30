CREATE TABLE "crm_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid,
	"contact_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"detail" text,
	"duration_seconds" integer,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"actor" text DEFAULT 'Office team' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"job_title" text,
	"email" text,
	"phone" text,
	"source" text DEFAULT 'other' NOT NULL,
	"status" text DEFAULT 'lead' NOT NULL,
	"owner" text,
	"customer_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"contact_id" uuid,
	"customer_id" uuid,
	"value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"stage" text DEFAULT 'lead' NOT NULL,
	"expected_close" date,
	"owner" text,
	"source" text DEFAULT 'other' NOT NULL,
	"lost_reason" text,
	"closed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_deal_id_crm_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_crm_activities_deal" ON "crm_activities" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "ix_crm_activities_contact" ON "crm_activities" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "ix_crm_activities_created" ON "crm_activities" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_crm_activities_updated" ON "crm_activities" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "ix_crm_contacts_status" ON "crm_contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ix_crm_contacts_customer" ON "crm_contacts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ix_crm_deals_stage" ON "crm_deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "ix_crm_deals_contact" ON "crm_deals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "ix_crm_deals_updated" ON "crm_deals" USING btree ("updated_at");