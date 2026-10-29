CREATE TABLE "user_visits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"visit_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_visits" ADD CONSTRAINT "user_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;