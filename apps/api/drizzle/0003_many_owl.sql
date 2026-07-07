CREATE TYPE "public"."run_mode" AS ENUM('async', 'sync', 'stream');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'done', 'failed', 'hitl');--> statement-breakpoint
CREATE TYPE "public"."run_triggered_by" AS ENUM('api_token', 'playground');--> statement-breakpoint
CREATE TABLE "run_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_id" varchar(255) NOT NULL,
	"session_id" varchar(255),
	"run_mode" "run_mode" NOT NULL,
	"status" "run_status" NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"duration_ms" integer,
	"error" text,
	"triggered_by" "run_triggered_by" DEFAULT 'api_token' NOT NULL,
	"api_key_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_logs_org_created_idx" ON "run_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "run_logs_session_id_idx" ON "run_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "run_logs_agent_id_idx" ON "run_logs" USING btree ("agent_id");