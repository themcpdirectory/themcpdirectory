CREATE TABLE "legal_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "server_health_checks" ADD COLUMN "final_origin" text;--> statement-breakpoint
ALTER TABLE "server_health_checks" ADD COLUMN "redirect_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "server_health_checks" ADD COLUMN "method_used" text;--> statement-breakpoint
CREATE INDEX "legal_holds_lookup_idx" ON "legal_holds" USING btree ("scope","subject_type","subject_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "server_health_checks_remote_checked_at_uidx" ON "server_health_checks" USING btree ("remote_id","checked_at") WHERE "server_health_checks"."remote_id" is not null;--> statement-breakpoint
CREATE INDEX "server_health_checks_checked_at_idx" ON "server_health_checks" USING btree ("checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trust_signals_server_key_checked_at_uidx" ON "trust_signals" USING btree ("server_id","signal_key","checked_at");--> statement-breakpoint
CREATE INDEX "trust_signals_checked_at_idx" ON "trust_signals" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "trust_signals_expires_at_idx" ON "trust_signals" USING btree ("expires_at");