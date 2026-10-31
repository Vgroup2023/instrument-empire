ALTER TABLE "crm_contacts" ADD COLUMN "business" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "business" text;--> statement-breakpoint
UPDATE "crm_contacts" SET "business" = 'bluestarimex' WHERE "business" IS NULL AND lower("email") LIKE '%@bluestarimex.com';--> statement-breakpoint
UPDATE "crm_contacts" SET "business" = 'globlex-ai' WHERE "business" IS NULL AND lower("email") LIKE '%@globlexai.com';--> statement-breakpoint
UPDATE "crm_deals" d SET "business" = c."business" FROM "crm_contacts" c WHERE d."contact_id" = c."id" AND d."business" IS NULL AND c."business" IS NOT NULL;
