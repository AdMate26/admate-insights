CREATE TABLE "ai_usage" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"route" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" text NOT NULL,
	"level" text NOT NULL,
	"parent_id" text,
	"external_id" text,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"objective" text NOT NULL,
	"objective_source" text NOT NULL,
	"status" text,
	"secondary_status" text,
	"budget" double precision,
	"first_seen" date NOT NULL,
	"last_seen" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_aliases" (
	"workspace_id" text NOT NULL,
	"platform" text NOT NULL,
	"level" text NOT NULL,
	"name_key" text NOT NULL,
	"entity_id" text NOT NULL,
	CONSTRAINT "entity_aliases_workspace_id_platform_level_name_key_pk" PRIMARY KEY("workspace_id","platform","level","name_key")
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"import_id" text NOT NULL,
	"platform" text NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_group_id" text,
	"ad_id" text,
	"granularity" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"replaced_by" text,
	"spend" double precision DEFAULT 0 NOT NULL,
	"impressions" double precision DEFAULT 0 NOT NULL,
	"reach" double precision DEFAULT 0 NOT NULL,
	"clicks_all" double precision DEFAULT 0 NOT NULL,
	"link_clicks" double precision DEFAULT 0 NOT NULL,
	"landing_page_views" double precision DEFAULT 0 NOT NULL,
	"engagements" double precision DEFAULT 0 NOT NULL,
	"follows" double precision DEFAULT 0 NOT NULL,
	"video_views" double precision DEFAULT 0 NOT NULL,
	"thruplays" double precision DEFAULT 0 NOT NULL,
	"leads" double precision DEFAULT 0 NOT NULL,
	"messages" double precision DEFAULT 0 NOT NULL,
	"installs" double precision DEFAULT 0 NOT NULL,
	"purchases" double precision DEFAULT 0 NOT NULL,
	"conversions" double precision DEFAULT 0 NOT NULL,
	"conversion_value" double precision DEFAULT 0 NOT NULL,
	"lead_form_opens" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"workspace_id" text NOT NULL,
	"objective" text NOT NULL,
	"target" double precision,
	"margin_pct" double precision,
	"lead_to_customer_pct" double precision,
	"profit_per_customer" double precision,
	CONSTRAINT "goals_workspace_id_objective_pk" PRIMARY KEY("workspace_id","objective")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" text NOT NULL,
	"file_name" text NOT NULL,
	"level" text NOT NULL,
	"granularity" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"row_count" integer NOT NULL,
	"currency" text,
	"attribution" text,
	"status" text DEFAULT 'active' NOT NULL,
	"diff" jsonb,
	"warnings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "narratives" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"surface" text NOT NULL,
	"facts_hash" text NOT NULL,
	"tone" text NOT NULL,
	"content" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_status" (
	"workspace_id" text NOT NULL,
	"key" text NOT NULL,
	"status" text NOT NULL,
	"dismiss_reason" text,
	"title" text,
	"snooze_until" date,
	"done_at" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_status_workspace_id_key_pk" PRIMARY KEY("workspace_id","key")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narratives" ADD CONSTRAINT "narratives_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_status" ADD CONSTRAINT "rec_status_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_ws_idx" ON "entities" USING btree ("workspace_id","platform","level");--> statement-breakpoint
CREATE INDEX "entities_ext_idx" ON "entities" USING btree ("workspace_id","platform","level","external_id");--> statement-breakpoint
CREATE INDEX "facts_ws_period_idx" ON "facts" USING btree ("workspace_id","active","period_start","period_end");--> statement-breakpoint
CREATE INDEX "facts_import_idx" ON "facts" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "imports_ws_idx" ON "imports" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "narratives_key_idx" ON "narratives" USING btree ("workspace_id","surface","facts_hash","tone");