CREATE TYPE "public"."order_status" AS ENUM('received', 'parsing', 'needs_review', 'confirmed', 'on_hold', 'processing', 'ready_to_ship', 'shipped', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."service_message_status" AS ENUM('open', 'handling', 'auto_replied', 'awaiting_approval', 'escalated', 'closed');--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"message_id" uuid,
	"agent" text NOT NULL,
	"action" text NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sku" text,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2),
	"product_id" uuid,
	"reserved_qty" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"channel" text DEFAULT 'manual' NOT NULL,
	"status" "order_status" DEFAULT 'received' NOT NULL,
	"customer_id" uuid,
	"customer_name" text,
	"customer_email" text,
	"po_number" text,
	"ship_line1" text,
	"ship_city" text,
	"ship_region" text,
	"ship_postal" text,
	"ship_country" text,
	"raw_text" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"total" numeric(14, 2),
	"hold_reason" text,
	"shipping_method" text,
	"ship_by_date" date,
	"carrier" text,
	"tracking_no" text,
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "service_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"from_email" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"channel" text DEFAULT 'manual' NOT NULL,
	"intent" text,
	"status" "service_message_status" DEFAULT 'open' NOT NULL,
	"reply_draft" text,
	"replied_at" timestamp with time zone,
	"handled_by" text,
	"escalation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_message_id_service_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."service_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_messages" ADD CONSTRAINT "service_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;