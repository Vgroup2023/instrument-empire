CREATE TYPE "public"."tax_country" AS ENUM('US', 'CA');--> statement-breakpoint
CREATE TYPE "public"."tax_return_status" AS ENUM('draft', 'ready');--> statement-breakpoint
CREATE TABLE "tax_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country" "tax_country" NOT NULL,
	"tax_year" integer NOT NULL,
	"title" text NOT NULL,
	"status" "tax_return_status" DEFAULT 'draft' NOT NULL,
	"inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ix_tax_returns_updated_at" ON "tax_returns" USING btree ("updated_at");