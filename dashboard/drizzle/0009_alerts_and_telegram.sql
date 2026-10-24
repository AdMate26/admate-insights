CREATE TABLE "alert_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"metric" text NOT NULL,
	"op" text NOT NULL,
	"value" double precision NOT NULL,
	"scope" text NOT NULL,
	"on" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_sends" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"digest" text NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_targets" (
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"mode" text NOT NULL,
	"value" double precision NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_targets_workspace_id_campaign_id_pk" PRIMARY KEY("workspace_id","campaign_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"user_id" text PRIMARY KEY NOT NULL,
	"chat_id" text,
	"username" text,
	"link_code" text,
	"link_code_expires" timestamp with time zone,
	"on" boolean DEFAULT false NOT NULL,
	"when" text DEFAULT 'now' NOT NULL,
	"time" text DEFAULT '09:00' NOT NULL,
	"days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"tz" text DEFAULT 'Asia/Phnom_Penh' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_sends" ADD CONSTRAINT "alert_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_sends" ADD CONSTRAINT "alert_sends_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_rules_ws_idx" ON "alert_rules" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "alert_sends_user_idx" ON "alert_sends" USING btree ("user_id","workspace_id","sent_at");