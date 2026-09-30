CREATE TYPE "public"."audit_log_action" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."audit_log_entity_type" AS ENUM('journal_entry', 'account');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "audit_log_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_log_action" NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
