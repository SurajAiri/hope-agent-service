ALTER TABLE "run_logs" ADD COLUMN "thread_id" varchar(255);--> statement-breakpoint
CREATE INDEX "run_logs_thread_id_idx" ON "run_logs" USING btree ("thread_id");