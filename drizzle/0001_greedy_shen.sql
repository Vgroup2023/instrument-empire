CREATE TYPE "public"."document_entity_type" AS ENUM('invoice', 'estimate', 'customer', 'product', 'payment_link');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" "document_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"content_base64" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
