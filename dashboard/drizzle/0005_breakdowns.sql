CREATE TABLE "breakdowns" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"import_id" text NOT NULL,
	"platform" text NOT NULL,
	"kind" text NOT NULL,
	"segment" text NOT NULL,
	"campaign_id" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"replaced_by" text,
	"measures" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imports" ADD COLUMN "kind" text DEFAULT 'performance' NOT NULL;--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breakdowns" ADD CONSTRAINT "breakdowns_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "breakdowns_ws_kind_idx" ON "breakdowns" USING btree ("workspace_id","kind","active","period_start","period_end");--> statement-breakpoint
CREATE INDEX "breakdowns_import_idx" ON "breakdowns" USING btree ("import_id");