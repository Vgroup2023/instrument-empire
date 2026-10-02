CREATE TABLE "hts_codes" (
	"htsno" text PRIMARY KEY NOT NULL,
	"indent" integer NOT NULL,
	"description" text NOT NULL,
	"path" text NOT NULL,
	"general" text,
	"special" text,
	"other" text,
	"units" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chapter" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "screening_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"type" text,
	"name" text NOT NULL,
	"alt_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"programs" text
);
--> statement-breakpoint
CREATE TABLE "shipment_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"doc_type" text DEFAULT 'commercial_invoice' NOT NULL,
	"file_name" text,
	"extracted" jsonb NOT NULL,
	"status" text DEFAULT 'extracted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD COLUMN "hts_suggestion" jsonb;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD COLUMN "hts_suggestion_key" text;--> statement-breakpoint
ALTER TABLE "shipment_documents" ADD CONSTRAINT "shipment_documents_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;