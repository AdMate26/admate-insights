ALTER TABLE "imports" ADD COLUMN "columns" jsonb;--> statement-breakpoint
ALTER TABLE "rec_status" ADD COLUMN "baseline" jsonb;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "country" text;