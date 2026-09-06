CREATE TABLE "cli_telemetry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"server_id" uuid,
	"cli_major_minor" text NOT NULL,
	"client" text,
	"success" boolean NOT NULL,
	"install_variant" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cli_telemetry_events_event_check" CHECK ("event" in ('search', 'add', 'remove', 'update')),
	CONSTRAINT "cli_telemetry_events_cli_major_minor_check" CHECK ("cli_major_minor" ~ '^[0-9]+\.[0-9]+$'),
	CONSTRAINT "cli_telemetry_events_client_check" CHECK ("client" is null or "client" in ('claude-code', 'codex', 'cursor', 'vscode')),
	CONSTRAINT "cli_telemetry_events_install_variant_check" CHECK ("install_variant" is null or "install_variant" in ('package', 'remote'))
);
--> statement-breakpoint
CREATE TABLE "cli_telemetry_daily_counts" (
	"day" date NOT NULL,
	"event" text NOT NULL,
	"server_id" uuid,
	"cli_major_minor" text NOT NULL,
	"client" text,
	"success" boolean NOT NULL,
	"install_variant" text,
	"count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "cli_telemetry_daily_counts_nonnegative_check" CHECK ("count" >= 0),
	CONSTRAINT "cli_telemetry_daily_counts_event_check" CHECK ("event" in ('search', 'add', 'remove', 'update')),
	CONSTRAINT "cli_telemetry_daily_counts_cli_major_minor_check" CHECK ("cli_major_minor" ~ '^[0-9]+\.[0-9]+$'),
	CONSTRAINT "cli_telemetry_daily_counts_client_check" CHECK ("client" is null or "client" in ('claude-code', 'codex', 'cursor', 'vscode')),
	CONSTRAINT "cli_telemetry_daily_counts_install_variant_check" CHECK ("install_variant" is null or "install_variant" in ('package', 'remote'))
);
--> statement-breakpoint
ALTER TABLE "cli_telemetry_events" ADD CONSTRAINT "cli_telemetry_events_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cli_telemetry_daily_counts" ADD CONSTRAINT "cli_telemetry_daily_counts_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "cli_telemetry_events_received_at_idx" ON "cli_telemetry_events" USING btree ("received_at");
--> statement-breakpoint
CREATE INDEX "cli_telemetry_events_event_server_received_at_idx" ON "cli_telemetry_events" USING btree ("event", "server_id", "received_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "cli_telemetry_daily_counts_dimensions_uidx" ON "cli_telemetry_daily_counts" USING btree ("day", "event", coalesce("server_id", '00000000-0000-0000-0000-000000000000'::uuid), "cli_major_minor", coalesce("client", ''), "success", coalesce("install_variant", ''));
--> statement-breakpoint
CREATE INDEX "cli_telemetry_daily_counts_server_day_idx" ON "cli_telemetry_daily_counts" USING btree ("server_id", "day");
--> statement-breakpoint
CREATE INDEX "cli_telemetry_daily_counts_day_idx" ON "cli_telemetry_daily_counts" USING btree ("day");
--> statement-breakpoint
ALTER TABLE "cli_telemetry_events" ADD COLUMN "aggregated_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "cli_telemetry_events_aggregation_idx" ON "cli_telemetry_events" USING btree ("aggregated_at", "received_at");
--> statement-breakpoint
CREATE TABLE "install_manifest_snapshots" (
	"manifest_hash" text NOT NULL,
	"server_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "install_manifest_snapshots_server_id_client_id_manifest_hash_pk" PRIMARY KEY("server_id","client_id","manifest_hash"),
	CONSTRAINT "install_manifest_snapshots_hash_check" CHECK ("manifest_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "install_manifest_snapshots_client_check" CHECK ("client_id" in ('', 'claude-code', 'codex', 'cursor', 'vscode'))
);
--> statement-breakpoint
ALTER TABLE "install_manifest_snapshots" ADD CONSTRAINT "install_manifest_snapshots_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "install_manifest_snapshots_server_hash_idx" ON "install_manifest_snapshots" USING btree ("server_id", "manifest_hash");