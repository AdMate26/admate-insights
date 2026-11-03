CREATE TABLE "tiktok_beta_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tiktok_beta_events" ADD CONSTRAINT "tiktok_beta_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tiktok_beta_events_user_idx" ON "tiktok_beta_events" USING btree ("user_id","kind","created_at");