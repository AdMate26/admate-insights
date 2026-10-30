CREATE TABLE "tiktok_syncs" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"advertiser_id" text NOT NULL,
	"locked_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"error_code" text,
	"rows" integer,
	"period_start" date,
	"period_end" date,
	"import_id" text,
	"fingerprint" text
);
--> statement-breakpoint
ALTER TABLE "tiktok_syncs" ADD CONSTRAINT "tiktok_syncs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_syncs" ADD CONSTRAINT "tiktok_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;