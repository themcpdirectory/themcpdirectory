LOCK TABLE "servers" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
WITH "ranked_repository_identities" AS (
	SELECT
		"id",
		first_value("id") OVER (
			PARTITION BY "repository_source", "repository_external_id"
			ORDER BY "first_seen_at", "created_at", "id"
		) AS "retained_by_server_id",
		row_number() OVER (
			PARTITION BY "repository_source", "repository_external_id"
			ORDER BY "first_seen_at", "created_at", "id"
		) AS "identity_rank"
	FROM "servers"
	WHERE "repository_source" IS NOT NULL AND "repository_external_id" IS NOT NULL
)
INSERT INTO "moderation_events" ("server_id", "action", "reason", "metadata")
SELECT
	"servers"."id",
	'repository_identity_conflict_quarantined',
	'Historical duplicate repository identity detected while enabling global uniqueness.',
	jsonb_build_object(
		'repositoryUrl', "servers"."repository_url",
		'repositorySource', "servers"."repository_source",
		'repositoryExternalId', "servers"."repository_external_id",
		'repositorySubfolder', "servers"."repository_subfolder",
		'previousModerationStatus', "servers"."moderation_status",
		'retainedByServerId', "ranked_repository_identities"."retained_by_server_id"
	)
FROM "servers"
INNER JOIN "ranked_repository_identities"
	ON "ranked_repository_identities"."id" = "servers"."id"
WHERE "ranked_repository_identities"."identity_rank" > 1;
--> statement-breakpoint
WITH "ranked_repository_identities" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "repository_source", "repository_external_id"
			ORDER BY "first_seen_at", "created_at", "id"
		) AS "identity_rank"
	FROM "servers"
	WHERE "repository_source" IS NOT NULL AND "repository_external_id" IS NOT NULL
)
UPDATE "servers"
SET
	"repository_url" = NULL,
	"repository_source" = NULL,
	"repository_external_id" = NULL,
	"repository_subfolder" = NULL,
	"moderation_status" = 'under_review',
	"updated_at" = now()
FROM "ranked_repository_identities"
WHERE "ranked_repository_identities"."id" = "servers"."id"
	AND "ranked_repository_identities"."identity_rank" > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "servers_repository_identity_uidx" ON "servers" USING btree ("repository_source","repository_external_id") WHERE "servers"."repository_source" is not null and "servers"."repository_external_id" is not null;