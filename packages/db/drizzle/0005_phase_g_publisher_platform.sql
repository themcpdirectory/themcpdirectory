CREATE TABLE "account_erasure_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_step" text DEFAULT 'requested' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_erasure_requests_status_check" CHECK ("account_erasure_requests"."status" in ('pending', 'in_progress', 'retry_scheduled', 'completed', 'failed', 'blocked'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issuer" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_verification_nonces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"state_ref" text NOT NULL,
	"state_hash" text NOT NULL,
	"pkce_verifier_ciphertext" text NOT NULL,
	"return_to" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publisher_claim_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"reason" text,
	"evidence_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publisher_claim_events_to_status_check" CHECK ("publisher_claim_events"."to_status" in ('pending', 'verifying', 'verified', 'rejected', 'withdrawn', 'superseded', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "publisher_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"publisher_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"verification_method" text NOT NULL,
	"github_subject_type" text NOT NULL,
	"github_subject_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"evidence_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_reason" text,
	"conflict_claim_id" uuid,
	"reviewed_by_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publisher_claims_status_check" CHECK ("publisher_claims"."status" in ('pending', 'verifying', 'verified', 'rejected', 'withdrawn', 'superseded', 'revoked')),
	CONSTRAINT "publisher_claims_verification_method_check" CHECK ("publisher_claims"."verification_method" in ('github_repository', 'github_organization')),
	CONSTRAINT "publisher_claims_subject_type_check" CHECK ("publisher_claims"."github_subject_type" in ('repository', 'organization'))
);
--> statement-breakpoint
CREATE TABLE "transactional_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"event_key" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publishers" ADD COLUMN "ownership_state" text DEFAULT 'unlocked' NOT NULL;--> statement-breakpoint
ALTER TABLE "publishers" ADD COLUMN "ownership_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "publishers" ADD COLUMN "ownership_lock_reason" text;--> statement-breakpoint
ALTER TABLE "account_erasure_requests" ADD CONSTRAINT "account_erasure_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_verification_nonces" ADD CONSTRAINT "claim_verification_nonces_claim_id_publisher_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."publisher_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_verification_nonces" ADD CONSTRAINT "claim_verification_nonces_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_claim_events" ADD CONSTRAINT "publisher_claim_events_claim_id_publisher_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."publisher_claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_claim_events" ADD CONSTRAINT "publisher_claim_events_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_claims" ADD CONSTRAINT "publisher_claims_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_claims" ADD CONSTRAINT "publisher_claims_publisher_id_publishers_id_fk" FOREIGN KEY ("publisher_id") REFERENCES "public"."publishers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_claims" ADD CONSTRAINT "publisher_claims_requester_user_id_user_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_claims" ADD CONSTRAINT "publisher_claims_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher_claims" ADD CONSTRAINT "publisher_claims_conflict_claim_id_fk" FOREIGN KEY ("conflict_claim_id") REFERENCES "public"."publisher_claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_erasure_requests_user_id_idx" ON "account_erasure_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_erasure_requests_status_idx" ON "account_erasure_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "account_erasure_requests_next_attempt_at_idx" ON "account_erasure_requests" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_user_id_idx" ON "audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_events_resource_lookup_idx" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_id_uidx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_uidx" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_uidx" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_verification_nonces_state_ref_uidx" ON "claim_verification_nonces" USING btree ("state_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_verification_nonces_state_hash_uidx" ON "claim_verification_nonces" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "claim_verification_nonces_requester_user_id_idx" ON "claim_verification_nonces" USING btree ("requester_user_id");--> statement-breakpoint
CREATE INDEX "claim_verification_nonces_claim_id_idx" ON "claim_verification_nonces" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "publisher_claim_events_claim_id_idx" ON "publisher_claim_events" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "publisher_claim_events_actor_user_id_idx" ON "publisher_claim_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "publisher_claims_server_id_idx" ON "publisher_claims" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "publisher_claims_publisher_id_idx" ON "publisher_claims" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "publisher_claims_requester_user_id_idx" ON "publisher_claims" USING btree ("requester_user_id");--> statement-breakpoint
CREATE INDEX "publisher_claims_github_subject_id_idx" ON "publisher_claims" USING btree ("github_subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publisher_claims_open_server_uidx" ON "publisher_claims" USING btree ("server_id") WHERE "publisher_claims"."status" in ('pending', 'verifying');--> statement-breakpoint
CREATE UNIQUE INDEX "transactional_outbox_event_key_uidx" ON "transactional_outbox" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "transactional_outbox_delivery_idx" ON "transactional_outbox" USING btree ("delivered_at","available_at");--> statement-breakpoint
CREATE INDEX "transactional_outbox_event_type_idx" ON "transactional_outbox" USING btree ("event_type");--> statement-breakpoint
ALTER TABLE "publisher_memberships" ADD CONSTRAINT "publisher_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action NOT VALID;--> statement-breakpoint
CREATE UNIQUE INDEX "publisher_memberships_publisher_user_uidx" ON "publisher_memberships" USING btree ("publisher_id","user_id");--> statement-breakpoint
ALTER TABLE "publishers" ADD CONSTRAINT "publishers_ownership_state_check" CHECK ("publishers"."ownership_state" in ('unlocked', 'manual_review'));