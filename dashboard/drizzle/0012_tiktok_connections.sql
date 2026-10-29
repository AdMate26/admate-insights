CREATE TABLE "tiktok_advertiser_links" (
	"user_id" text NOT NULL,
	"advertiser_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"advertiser_name" text,
	"currency" text,
	"timezone" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiktok_advertiser_links_user_id_advertiser_id_pk" PRIMARY KEY("user_id","advertiser_id")
);
--> statement-breakpoint
CREATE TABLE "tiktok_connections" (
	"user_id" text PRIMARY KEY NOT NULL,
	"server" text NOT NULL,
	"client_id" text NOT NULL,
	"access_token_enc" text,
	"access_expires_at" timestamp with time zone,
	"refresh_token_enc" text,
	"refresh_expires_at" timestamp with time zone,
	"scope" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refreshed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tiktok_oauth_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_hash" text NOT NULL,
	"verifier_enc" text NOT NULL,
	"server" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tiktok_advertiser_links" ADD CONSTRAINT "tiktok_advertiser_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_advertiser_links" ADD CONSTRAINT "tiktok_advertiser_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_connections" ADD CONSTRAINT "tiktok_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_oauth_states" ADD CONSTRAINT "tiktok_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tiktok_advertiser_links_ws_idx" ON "tiktok_advertiser_links" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "tiktok_oauth_states_user_idx" ON "tiktok_oauth_states" USING btree ("user_id");