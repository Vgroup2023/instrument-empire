CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid,
	"shift_date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"job_title_code" integer,
	"location" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"meal_minutes" integer DEFAULT 0 NOT NULL,
	"job_title_code" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_off_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"kind" text DEFAULT 'vacation' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workforce_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"facility_id" text,
	"state_code" text,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"meal_deduct_minutes" integer DEFAULT 30 NOT NULL,
	"meal_threshold_hours" numeric(4, 2) DEFAULT '6' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "staff_code" text;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "pbj_job_title_code" integer;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "pbj_pay_type_code" integer;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "termination_date" date;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "clock_pin_hash" text;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "pin_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_employees" ADD COLUMN "pin_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off_requests" ADD CONSTRAINT "time_off_requests_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_shifts_date" ON "shifts" USING btree ("shift_date");--> statement-breakpoint
CREATE INDEX "ix_shifts_employee_date" ON "shifts" USING btree ("employee_id","shift_date");--> statement-breakpoint
CREATE INDEX "ix_time_entries_employee_date" ON "time_entries" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "ix_time_entries_work_date" ON "time_entries" USING btree ("work_date");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_time_entries_one_open" ON "time_entries" USING btree ("employee_id") WHERE "time_entries"."clock_out" is null;--> statement-breakpoint
CREATE INDEX "ix_time_off_dates" ON "time_off_requests" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_payroll_employees_staff_code" ON "payroll_employees" USING btree ("staff_code");