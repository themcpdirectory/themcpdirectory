-- Hand-edited: Drizzle Kit cannot represent CREATE EXTENSION or GIN indexes
CREATE EXTENSION IF NOT EXISTS citext;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "client_compatibility" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"status" text NOT NULL,
	"reason" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_compatibility_status_check" CHECK ("client_compatibility"."status" in ('supported', 'supported_with_configuration', 'unsupported', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "install_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"variant_id" text,
	"override_payload" jsonb NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publisher_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publisher_memberships_role_check" CHECK ("publisher_memberships"."role" in ('owner', 'admin', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "publishers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"website_url" text,
	"github_org" text,
	"logo_url" text,
	"verification_state" text DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publishers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "publishers_verification_state_check" CHECK ("publishers"."verification_state" in ('unverified', 'pending', 'verified', 'rejected', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "registry_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registry_source_id" uuid NOT NULL,
	"external_name" text NOT NULL,
	"external_version" text NOT NULL,
	"schema_uri" text,
	"payload_hash" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_snapshots_identity" UNIQUE("registry_source_id","external_name","external_version","payload_hash")
);
--> statement-breakpoint
CREATE TABLE "registry_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_sources_key_unique" UNIQUE("key"),
	CONSTRAINT "registry_sources_kind_check" CHECK ("registry_sources"."kind" in ('mcp-registry'))
);
--> statement-breakpoint
CREATE TABLE "registry_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registry_source_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"cursor_start" text,
	"cursor_end" text,
	"records_seen" integer DEFAULT 0 NOT NULL,
	"records_created" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_sync_runs_status_check" CHECK ("registry_sync_runs"."status" in ('running', 'succeeded', 'partially_failed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"reporter_user_id" uuid,
	"reporter_email" text,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_category_check" CHECK ("reports"."category" in ('malware', 'impersonation', 'incorrect_metadata', 'broken', 'abandoned', 'security', 'spam', 'other'))
);
--> statement-breakpoint
CREATE TABLE "repository_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_repository_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"default_branch" text,
	"is_archived" boolean,
	"is_fork" boolean,
	"stars" integer,
	"forks" integer,
	"open_issues" integer,
	"license_spdx" text,
	"last_push_at" timestamp with time zone,
	"last_release_at" timestamp with time zone,
	"payload" jsonb,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_aliases_kind_check" CHECK ("server_aliases"."kind" in ('slug', 'package', 'legacy_name', 'repository', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "server_categories" (
	"server_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"source" text NOT NULL,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_categories_server_id_category_id_pk" PRIMARY KEY("server_id","category_id"),
	CONSTRAINT "server_categories_source_check" CHECK ("server_categories"."source" in ('manual', 'publisher', 'classifier', 'import'))
);
--> statement-breakpoint
CREATE TABLE "server_health_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"server_version_id" uuid,
	"remote_id" uuid,
	"check_type" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"http_status" integer,
	"error_code" text,
	"error_summary" text,
	"checked_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_icons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_version_id" uuid NOT NULL,
	"src" text NOT NULL,
	"mime_type" text,
	"sizes" text,
	"theme" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_version_id" uuid NOT NULL,
	"registry_type" text NOT NULL,
	"registry_base_url" text,
	"identifier" text NOT NULL,
	"version" text,
	"file_sha256" text,
	"runtime_hint" text,
	"transport_type" text NOT NULL,
	"runtime_arguments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"package_arguments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"environment_variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_remotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_version_id" uuid NOT NULL,
	"transport_type" text NOT NULL,
	"url_template" text NOT NULL,
	"headers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"registry_source_id" uuid,
	"registry_snapshot_id" uuid,
	"version" text NOT NULL,
	"schema_uri" text,
	"upstream_status" text,
	"description" text,
	"title" text,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"normalized_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_versions_identity" UNIQUE("server_id","version","registry_source_id")
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"short_description" text NOT NULL,
	"long_description" text,
	"canonical_registry_name" text,
	"publisher_id" uuid,
	"listing_status" text NOT NULL,
	"moderation_status" text NOT NULL,
	"current_version_id" uuid,
	"repository_url" text,
	"repository_source" text,
	"repository_external_id" text,
	"repository_subfolder" text,
	"homepage_url" text,
	"documentation_url" text,
	"license_spdx" text,
	"source_available" boolean,
	"open_source" boolean,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"search_document" text,
	"search_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servers_slug_unique" UNIQUE("slug"),
	CONSTRAINT "servers_listing_status_check" CHECK ("servers"."listing_status" in ('active', 'deprecated', 'deleted_upstream', 'unavailable')),
	CONSTRAINT "servers_moderation_status_check" CHECK ("servers"."moderation_status" in ('normal', 'under_review', 'hidden', 'blocked'))
);
--> statement-breakpoint
CREATE TABLE "trust_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"server_version_id" uuid,
	"signal_key" text NOT NULL,
	"status" text NOT NULL,
	"source" text,
	"summary" text,
	"details" text,
	"checked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trust_signals_status_check" CHECK ("trust_signals"."status" in ('positive', 'neutral', 'warning', 'negative', 'unknown'))
);
--> statement-breakpoint
ALTER TABLE "client_compatibility" ADD CONSTRAINT "client_compatibility_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "install_overrides" ADD CONSTRAINT "install_overrides_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_events" ADD CONSTRAINT "moderation_events_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_memberships" ADD CONSTRAINT "publisher_memberships_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_snapshots" ADD CONSTRAINT "registry_snapshots_registry_source_id_registry_sources_id_fk" FOREIGN KEY ("registry_source_id") REFERENCES "public"."registry_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_sync_runs" ADD CONSTRAINT "registry_sync_runs_registry_source_id_registry_sources_id_fk" FOREIGN KEY ("registry_source_id") REFERENCES "public"."registry_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_snapshots" ADD CONSTRAINT "repository_snapshots_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_aliases" ADD CONSTRAINT "server_aliases_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_categories" ADD CONSTRAINT "server_categories_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_categories" ADD CONSTRAINT "server_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_health_checks" ADD CONSTRAINT "server_health_checks_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_health_checks" ADD CONSTRAINT "server_health_checks_server_version_id_server_versions_id_fk" FOREIGN KEY ("server_version_id") REFERENCES "public"."server_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_health_checks" ADD CONSTRAINT "server_health_checks_remote_id_server_remotes_id_fk" FOREIGN KEY ("remote_id") REFERENCES "public"."server_remotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_icons" ADD CONSTRAINT "server_icons_server_version_id_server_versions_id_fk" FOREIGN KEY ("server_version_id") REFERENCES "public"."server_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_packages" ADD CONSTRAINT "server_packages_server_version_id_server_versions_id_fk" FOREIGN KEY ("server_version_id") REFERENCES "public"."server_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_remotes" ADD CONSTRAINT "server_remotes_server_version_id_server_versions_id_fk" FOREIGN KEY ("server_version_id") REFERENCES "public"."server_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_versions" ADD CONSTRAINT "server_versions_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_versions" ADD CONSTRAINT "server_versions_registry_source_id_registry_sources_id_fk" FOREIGN KEY ("registry_source_id") REFERENCES "public"."registry_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_versions" ADD CONSTRAINT "server_versions_registry_snapshot_id_registry_snapshots_id_fk" FOREIGN KEY ("registry_snapshot_id") REFERENCES "public"."registry_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_signals" ADD CONSTRAINT "trust_signals_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_signals" ADD CONSTRAINT "trust_signals_server_version_id_server_versions_id_fk" FOREIGN KEY ("server_version_id") REFERENCES "public"."server_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_compatibility_server_id_idx" ON "client_compatibility" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "install_overrides_server_id_idx" ON "install_overrides" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "moderation_events_server_id_idx" ON "moderation_events" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "publisher_memberships_publisher_id_idx" ON "publisher_memberships" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "publisher_memberships_user_id_idx" ON "publisher_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "registry_snapshots_registry_source_id_idx" ON "registry_snapshots" USING btree ("registry_source_id");--> statement-breakpoint
CREATE INDEX "registry_sync_runs_registry_source_id_idx" ON "registry_sync_runs" USING btree ("registry_source_id");--> statement-breakpoint
CREATE INDEX "reports_server_id_idx" ON "reports" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "repository_snapshots_server_id_idx" ON "repository_snapshots" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "repository_snapshots_external_repo_id_idx" ON "repository_snapshots" USING btree ("external_repository_id");--> statement-breakpoint
CREATE INDEX "server_aliases_server_id_idx" ON "server_aliases" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "server_categories_category_id_idx" ON "server_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "server_health_checks_server_id_idx" ON "server_health_checks" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "server_health_checks_server_version_id_idx" ON "server_health_checks" USING btree ("server_version_id");--> statement-breakpoint
CREATE INDEX "server_icons_server_version_id_idx" ON "server_icons" USING btree ("server_version_id");--> statement-breakpoint
CREATE INDEX "server_packages_server_version_id_idx" ON "server_packages" USING btree ("server_version_id");--> statement-breakpoint
CREATE INDEX "server_remotes_server_version_id_idx" ON "server_remotes" USING btree ("server_version_id");--> statement-breakpoint
CREATE INDEX "server_versions_server_id_idx" ON "server_versions" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "server_versions_registry_source_id_idx" ON "server_versions" USING btree ("registry_source_id");--> statement-breakpoint
CREATE INDEX "server_versions_registry_snapshot_id_idx" ON "server_versions" USING btree ("registry_snapshot_id");--> statement-breakpoint
CREATE INDEX "servers_publisher_id_idx" ON "servers" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "servers_listing_status_idx" ON "servers" USING btree ("listing_status");--> statement-breakpoint
CREATE INDEX "servers_moderation_status_idx" ON "servers" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "trust_signals_server_id_idx" ON "trust_signals" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "trust_signals_server_version_id_idx" ON "trust_signals" USING btree ("server_version_id");--> statement-breakpoint
-- Hand-edited: Drizzle Kit cannot represent tsvector columns or GIN indexes
ALTER TABLE "servers" ADD COLUMN "search_tsv" tsvector;--> statement-breakpoint
CREATE INDEX "servers_search_document_idx" ON "servers" USING GIN("search_tsv");--> statement-breakpoint
CREATE INDEX "servers_title_trgm_idx" ON "servers" USING GIN("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "servers_slug_trgm_idx" ON "servers" USING GIN("slug" gin_trgm_ops);