CREATE TABLE "team_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"from_user_id" uuid,
	"from_name" text NOT NULL,
	"to_department" text,
	"to_user_id" uuid,
	"status" text DEFAULT 'open' NOT NULL,
	"href" text,
	"source" text,
	"due_date" date,
	"done_at" timestamp with time zone,
	"done_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_to_user_id_app_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_team_tasks_source" ON "team_tasks" USING btree ("source") WHERE "team_tasks"."source" is not null;--> statement-breakpoint
CREATE INDEX "ix_team_tasks_open" ON "team_tasks" USING btree ("status","to_department");--> statement-breakpoint
CREATE INDEX "ix_team_tasks_user" ON "team_tasks" USING btree ("to_user_id","status");--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;