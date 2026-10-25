CREATE TABLE "pay_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"regular_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"overtime_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"regular_pay" numeric(14, 2) DEFAULT '0' NOT NULL,
	"overtime_pay" numeric(14, 2) DEFAULT '0' NOT NULL,
	"extra_pay" numeric(14, 2) DEFAULT '0' NOT NULL,
	"gross" numeric(14, 2) DEFAULT '0' NOT NULL,
	"pretax_benefits" numeric(14, 2) DEFAULT '0' NOT NULL,
	"pretax_retirement" numeric(14, 2) DEFAULT '0' NOT NULL,
	"after_tax" numeric(14, 2) DEFAULT '0' NOT NULL,
	"federal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"social_security" numeric(14, 2) DEFAULT '0' NOT NULL,
	"medicare" numeric(14, 2) DEFAULT '0' NOT NULL,
	"additional_medicare" numeric(14, 2) DEFAULT '0' NOT NULL,
	"state" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net" numeric(14, 2) DEFAULT '0' NOT NULL,
	"employer_social_security" numeric(14, 2) DEFAULT '0' NOT NULL,
	"employer_medicare" numeric(14, 2) DEFAULT '0' NOT NULL,
	"futa" numeric(14, 2) DEFAULT '0' NOT NULL,
	"suta" numeric(14, 2) DEFAULT '0' NOT NULL,
	"fica_wages" numeric(14, 2) DEFAULT '0' NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "pay_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"pay_date" date NOT NULL,
	"frequency" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"journal_entry_id" uuid,
	"reversal_entry_id" uuid,
	"note" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_profiles" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"filing_status" text DEFAULT 'single' NOT NULL,
	"step2_checked" boolean DEFAULT false NOT NULL,
	"credits" numeric(14, 2) DEFAULT '0' NOT NULL,
	"other_income" numeric(14, 2) DEFAULT '0' NOT NULL,
	"deductions" numeric(14, 2) DEFAULT '0' NOT NULL,
	"extra_withholding" numeric(14, 2) DEFAULT '0' NOT NULL,
	"exempt" boolean DEFAULT false NOT NULL,
	"state_code" text,
	"state_percent" numeric(6, 3) DEFAULT '0' NOT NULL,
	"state_fixed" numeric(14, 2) DEFAULT '0' NOT NULL,
	"pretax_benefits" numeric(14, 2) DEFAULT '0' NOT NULL,
	"pretax_retirement" numeric(14, 2) DEFAULT '0' NOT NULL,
	"after_tax" numeric(14, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"frequency" text DEFAULT 'biweekly' NOT NULL,
	"wages_account_id" uuid,
	"employer_tax_account_id" uuid,
	"tax_payable_account_id" uuid,
	"deductions_payable_account_id" uuid,
	"pay_from_account_id" uuid,
	"suta_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"suta_wage_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pay_run_items" ADD CONSTRAINT "pay_run_items_run_id_pay_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pay_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_run_items" ADD CONSTRAINT "pay_run_items_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_reversal_entry_id_journal_entries_id_fk" FOREIGN KEY ("reversal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_profiles" ADD CONSTRAINT "payroll_profiles_employee_id_payroll_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."payroll_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_wages_account_id_accounts_id_fk" FOREIGN KEY ("wages_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_employer_tax_account_id_accounts_id_fk" FOREIGN KEY ("employer_tax_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_tax_payable_account_id_accounts_id_fk" FOREIGN KEY ("tax_payable_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_deductions_payable_account_id_accounts_id_fk" FOREIGN KEY ("deductions_payable_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_pay_from_account_id_accounts_id_fk" FOREIGN KEY ("pay_from_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_pay_run_items_run_employee" ON "pay_run_items" USING btree ("run_id","employee_id");--> statement-breakpoint
CREATE INDEX "ix_pay_run_items_employee" ON "pay_run_items" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ix_pay_runs_pay_date" ON "pay_runs" USING btree ("pay_date");