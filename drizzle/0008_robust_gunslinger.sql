CREATE TABLE "shipment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"type" text NOT NULL,
	"location" text,
	"note" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"bin_location" text,
	"expected_pieces" integer,
	"received_pieces" integer,
	"damaged_pieces" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"free_days" integer DEFAULT 5 NOT NULL,
	"daily_rate" numeric(10, 2),
	"storage_billed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_receipts_shipment_id_unique" UNIQUE("shipment_id")
);
--> statement-breakpoint
ALTER TABLE "agent_findings" ADD COLUMN "department" text DEFAULT 'customs' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "carrier" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "container_no" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "last_free_date" date;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_receipts" ADD CONSTRAINT "warehouse_receipts_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;