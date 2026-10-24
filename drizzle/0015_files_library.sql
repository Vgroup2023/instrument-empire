CREATE TYPE "public"."file_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"store" text DEFAULT 'storage' NOT NULL,
	"storage_key" text,
	"content_base64" text,
	"label" text,
	"status" "file_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ix_files_created_at" ON "files" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_files_status" ON "files" USING btree ("status");