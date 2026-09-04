import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, createTempDatabase, listMigrationFilenames } from "./postgres-test-db.js";

describe("publisher platform schema", () => {
  let sql: Awaited<ReturnType<typeof createTempDatabase>>["sql"];
  let destroy: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    const temp = await createTempDatabase("task2_publisher_platform");
    sql = temp.sql;
    destroy = temp.destroy;
  });

  afterEach(async () => {
    await destroy?.();
  });

  it("preserves legal holds and existing publisher membership rows when applying the Phase G migration", async () => {
    await destroy?.();

    const migrationFilenames = await listMigrationFilenames();
    const phaseGMigration = migrationFilenames.find((filename) =>
      filename.endsWith("phase_g_publisher_platform.sql"),
    );
    const beforePhaseGMigrations = phaseGMigration
      ? migrationFilenames.filter((filename) => filename !== phaseGMigration)
      : migrationFilenames;

    const temp = await createTempDatabase("task2_publisher_platform_preserve", {
      migrations: beforePhaseGMigrations,
    });
    sql = temp.sql;
    destroy = temp.destroy;

    const publisherId = "22222222-2222-4222-8222-222222222222";
    const legacyUserId = "33333333-3333-4333-8333-333333333333";

    await sql`
      insert into publishers (id, slug, display_name, verification_state)
      values (${publisherId}, 'phase-g-preserved', 'Phase G Preserved', 'unverified')
    `;
    await sql`
      insert into publisher_memberships (publisher_id, user_id, role)
      values (${publisherId}, ${legacyUserId}, 'owner')
    `;
    await sql`
      insert into legal_holds (scope, subject_type, subject_id, reason, expires_at, created_by)
      values (
        'publisher_account',
        'user',
        ${legacyUserId},
        'migration review',
        '2026-12-31T00:00:00.000Z',
        'phase-g-test'
      )
    `;

    await applyMigrations(sql, [phaseGMigration ?? "0005_phase_g_publisher_platform.sql"]);

    const [membership] = await sql<Array<{ membership_count: number }>>`
      select count(*)::int as membership_count
      from publisher_memberships
      where publisher_id = ${publisherId}
        and user_id = ${legacyUserId}
    `;
    expect(membership?.membership_count).toBe(1);

    const [hold] = await sql<Array<{ legal_holds: string | null }>>`
      select to_regclass('legal_holds')::text as legal_holds
    `;
    expect(hold?.legal_holds).toBe("legal_holds");

    const columns = await sql<Array<{ column_name: string }>>`
      select column_name
      from information_schema.columns
      where table_name = 'publishers'
        and column_name in ('ownership_state', 'ownership_locked_at', 'ownership_lock_reason')
      order by column_name
    `;
    expect(columns.map((column) => column.column_name)).toEqual([
      "ownership_lock_reason",
      "ownership_locked_at",
      "ownership_state",
    ]);
  });

  it("rejects a second open claim for the same server", async () => {
    const serverId = "11111111-1111-4111-8111-111111111111";
    const publisherId = "22222222-2222-4222-8222-222222222222";
    const userId = "33333333-3333-4333-8333-333333333333";

    await sql`
      insert into publishers (id, slug, display_name, verification_state)
      values (${publisherId}, 'phase-g-claims', 'Phase G Claims', 'unverified')
    `;
    await sql`
      insert into servers (
        id,
        slug,
        title,
        short_description,
        listing_status,
        moderation_status,
        publisher_id,
        first_seen_at,
        last_seen_at
      ) values (
        ${serverId},
        'phase-g-claims-server',
        'Phase G Claims Server',
        'Claim uniqueness fixture',
        'active',
        'normal',
        ${publisherId},
        '2026-09-01T00:00:00.000Z',
        '2026-09-01T00:00:00.000Z'
      )
    `;
    await sql`
      insert into "user" (id, email, email_verified, name)
      values (${userId}, 'claims-user@example.com', false, 'Claims User')
    `;

    await sql`
      insert into publisher_claims (
        id,
        server_id,
        publisher_id,
        requester_user_id,
        verification_method,
        github_subject_type,
        github_subject_id,
        status,
        evidence_summary,
        expires_at
      ) values (
        '44444444-4444-4444-8444-444444444444',
        ${serverId},
        ${publisherId},
        ${userId},
        'github_repository',
        'repository',
        '12345678',
        'pending',
        '{}'::jsonb,
        '2026-10-01T00:00:00.000Z'
      )
    `;

    await expect(
      sql`
        insert into publisher_claims (
          id,
          server_id,
          publisher_id,
          requester_user_id,
          verification_method,
          github_subject_type,
          github_subject_id,
          status,
          evidence_summary,
          expires_at
        ) values (
          '55555555-5555-4555-8555-555555555555',
          ${serverId},
          ${publisherId},
          ${userId},
          'github_repository',
          'repository',
          '12345678',
          'verifying',
          '{}'::jsonb,
          '2026-10-01T00:00:00.000Z'
        )
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects duplicate publisher memberships for the same Better Auth user and rejects missing Better Auth users", async () => {
    const publisherId = "22222222-2222-4222-8222-222222222222";
    const userId = "33333333-3333-4333-8333-333333333333";
    const missingUserId = "66666666-6666-4666-8666-666666666666";

    await sql`
      insert into publishers (id, slug, display_name, verification_state)
      values (${publisherId}, 'phase-g-memberships', 'Phase G Memberships', 'unverified')
    `;
    await sql`
      insert into "user" (id, email, email_verified, name)
      values (${userId}, 'member-user@example.com', false, 'Member User')
    `;

    await sql`
      insert into publisher_memberships (publisher_id, user_id, role)
      values (${publisherId}, ${userId}, 'owner')
    `;

    await expect(
      sql`
        insert into publisher_memberships (publisher_id, user_id, role)
        values (${publisherId}, ${userId}, 'viewer')
      `,
    ).rejects.toMatchObject({ code: "23505" });

    await expect(
      sql`
        insert into publisher_memberships (publisher_id, user_id, role)
        values (${publisherId}, ${missingUserId}, 'editor')
      `,
    ).rejects.toMatchObject({ code: "23503" });
  });
});
