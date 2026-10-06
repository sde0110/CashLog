CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"institution" text DEFAULT '' NOT NULL,
	"linked_account_id" integer,
	"opening_balance" bigint DEFAULT 0 NOT NULL,
	"account_title" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"flow" text NOT NULL,
	"account_title" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"memo" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "recurring" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"category_id" integer NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"supply_amount" bigint DEFAULT 0 NOT NULL,
	"vat" bigint DEFAULT 0 NOT NULL,
	"from_account_id" integer,
	"to_account_id" integer,
	"vendor_id" integer,
	"project_id" integer,
	"day_of_month" integer DEFAULT 1 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_generated_ym" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"category_id" integer NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"supply_amount" bigint DEFAULT 0 NOT NULL,
	"vat" bigint DEFAULT 0 NOT NULL,
	"from_account_id" integer,
	"to_account_id" integer,
	"vendor_id" integer,
	"project_id" integer,
	"description" text DEFAULT '' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"payment_status" text DEFAULT '입금완료' NOT NULL,
	"payment_date" date,
	"invoice_status" text DEFAULT '해당없음' NOT NULL,
	"link_id" uuid,
	"recurring_id" integer,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_key" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"biz_no" text DEFAULT '' NOT NULL,
	"manager" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring" ADD CONSTRAINT "recurring_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_type_name" ON "categories" USING btree ("type","name");--> statement-breakpoint
CREATE INDEX "transactions_date" ON "transactions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "transactions_category" ON "transactions" USING btree ("category_id");