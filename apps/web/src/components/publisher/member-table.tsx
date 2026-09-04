"use client";

import { useState } from "react";
import type { PublisherRole } from "@themcpdirectory/auth";
import type { PublisherMemberSummary } from "@themcpdirectory/domain";
import { ErrorSummary } from "./error-summary";

const ROLE_OPTIONS: readonly PublisherRole[] = ["owner", "admin", "editor", "viewer"];

interface MemberTableProps {
  readonly members: readonly PublisherMemberSummary[];
  readonly canManageMembers: boolean;
}

export function MemberTable({ members, canManageMembers }: MemberTableProps) {
  const [pendingMembershipId, setPendingMembershipId] = useState<string | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);

  async function handleRoleChange(membershipId: string, role: PublisherRole) {
    setPendingMembershipId(membershipId);
    setErrors([]);
    try {
      const response = await fetch(`/api/publisher/v1/memberships/${membershipId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        setErrors([payload.error?.message ?? "Unable to update this member's role."]);
        return;
      }
      // The dashboard's member list is server-rendered; reload to reflect the new role.
      window.location.reload();
    } catch {
      setErrors(["Unable to update this member's role. Check your connection and try again."]);
    } finally {
      setPendingMembershipId(null);
    }
  }

  return (
    <section aria-labelledby="members-heading" className="publisher-panel">
      <h2 id="members-heading" style={{ margin: "0 0 0.75rem", fontSize: "1.0625rem" }}>
        Publisher members
      </h2>

      <ErrorSummary id="member-error-summary" errors={errors} />

      {members.length === 0 ? (
        <p className="detail-empty-state">No members found.</p>
      ) : (
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <table className="publisher-member-table">
            <caption className="sr-only">Members of this publisher and their roles</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.membershipId}>
                  <td>{member.displayName ?? "Unnamed"}</td>
                  <td>{member.email ?? "—"}</td>
                  <td>
                    {canManageMembers ? (
                      <>
                        <label className="sr-only" htmlFor={`role-${member.membershipId}`}>
                          Role for {member.displayName ?? member.email ?? "this member"}
                        </label>
                        <select
                          id={`role-${member.membershipId}`}
                          className="publisher-action"
                          value={member.role}
                          disabled={pendingMembershipId === member.membershipId}
                          onChange={(event) =>
                            void handleRoleChange(
                              member.membershipId,
                              event.target.value as PublisherRole,
                            )
                          }
                          style={{
                            padding: "0.375rem 0.5rem",
                            border: "1px solid var(--control-border)",
                            borderRadius: "var(--radius-sm)",
                            background: "var(--surface)",
                            color: "var(--fg)",
                            minHeight: "2.75rem",
                          }}
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      member.role
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
