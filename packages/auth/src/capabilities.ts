export type PublisherRole = "owner" | "admin" | "editor" | "viewer";

export type PublisherCapability =
  | "publisher.read"
  | "publisher.edit"
  | "claims.manage"
  | "members.manage"
  | "ownership.transfer"
  | "publisher.destroy";

const PUBLISHER_CAPABILITY_MATRIX: Record<PublisherRole, readonly PublisherCapability[]> = {
  owner: [
    "publisher.read",
    "publisher.edit",
    "claims.manage",
    "members.manage",
    "ownership.transfer",
    "publisher.destroy",
  ],
  admin: ["publisher.read", "publisher.edit", "claims.manage", "members.manage"],
  editor: ["publisher.read", "publisher.edit"],
  viewer: ["publisher.read"],
};

export function roleHasCapability(role: PublisherRole, capability: PublisherCapability): boolean {
  return PUBLISHER_CAPABILITY_MATRIX[role].includes(capability);
}
