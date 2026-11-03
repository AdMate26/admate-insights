CREATE TABLE "tiktok_sync_imports" (
	"import_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"advertiser_id" text NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tiktok_syncs" ADD COLUMN "lock_token" text;--> statement-breakpoint
ALTER TABLE "tiktok_sync_imports" ADD CONSTRAINT "tiktok_sync_imports_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_sync_imports" ADD CONSTRAINT "tiktok_sync_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tiktok_sync_imports_ws_idx" ON "tiktok_sync_imports" USING btree ("workspace_id","advertiser_id");