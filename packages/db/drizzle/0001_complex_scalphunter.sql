LOCK TABLE "servers" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
LOCK TABLE "repository_snapshots" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
WITH "ranked_snapshot_checks" AS (
	SELECT
		"id",
		"server_id",
		first_value("id") OVER (
			PARTITION BY "server_id", "provider", "checked_at"
			ORDER BY "created_at", "id"
		) AS "retained_snapshot_id",
		row_number() OVER (
			PARTITION BY "server_id", "provider", "checked_at"
			ORDER BY "created_at", "id"
		) AS "check_rank"
	FROM "repository_snapshots"
)
INSERT INTO "moderation_events" ("server_id", "action", "reason", "metadata")
SELECT
	"repository_snapshots"."server_id",
	'repository_snapshot_check_conflict_repaired',
	'Historical duplicate repository check detected while enabling snapshot idempotency.',
	jsonb_build_object(
		'originalSnapshot', to_jsonb("repository_snapshots"),
		'retainedBySnapshotId', "ranked_snapshot_checks"."retained_snapshot_id"
	)
FROM "repository_snapshots"
INNER JOIN "ranked_snapshot_checks"
	ON "ranked_snapshot_checks"."id" = "repository_snapshots"."id"
WHERE "ranked_snapshot_checks"."check_rank" > 1;
--> statement-breakpoint
WITH "ranked_snapshot_checks" AS (
	SELECT
		"id",
		"server_id",
		"provider",
		"checked_at",
		max("checked_at") OVER (
			PARTITION BY "server_id", "provider"
		) AS "max_checked_at",
		row_number() OVER (
			PARTITION BY "server_id", "provider", "checked_at"
			ORDER BY "created_at", "id"
		) AS "check_rank"
	FROM "repository_snapshots"
),
"conflicting_snapshot_checks" AS (
	SELECT
		"id",
		"max_checked_at",
		row_number() OVER (
			PARTITION BY "server_id", "provider"
			ORDER BY "checked_at", "id"
		) AS "conflict_rank"
	FROM "ranked_snapshot_checks"
	WHERE "check_rank" > 1
)
UPDATE "repository_snapshots"
SET "checked_at" =
	"conflicting_snapshot_checks"."max_checked_at"
	+ "conflicting_snapshot_checks"."conflict_rank" * interval '1 microsecond'
FROM "conflicting_snapshot_checks"
WHERE "conflicting_snapshot_checks"."id" = "repository_snapshots"."id";
--> statement-breakpoint
CREATE UNIQUE INDEX "repository_snapshots_check_uidx" ON "repository_snapshots" USING btree ("server_id","provider","checked_at");