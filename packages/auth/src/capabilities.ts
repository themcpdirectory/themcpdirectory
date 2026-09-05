export const PUBLISHER_ROLES = Object.freeze(["owner", "admin", "editor", "viewer"] as const);
export type PublisherRole = (typeof PUBLISHER_ROLES)[number];

export const PUBLISHER_CAPABILITIES = Object.freeze([
  "publisher.read",
  "publisher.edit",
  "claims.manage",
  "members.manage",
  "ownership.transfer",
  "publisher.destroy",
] as const);
export type PublisherCapability = (typeof PUBLISHER_CAPABILITIES)[number];

export const PUBLISHER_CAPABILITY_MATRIX = Object.freeze({
  owner: Object.freeze([
    "publisher.read",
    "publisher.edit",
    "claims.manage",
    "members.manage",
    "ownership.transfer",
    "publisher.destroy",
  ] as const),
  admin: Object.freeze([
    "publisher.read",
    "publisher.edit",
    "claims.manage",
    "members.manage",
  ] as const),
  editor: Object.freeze(["publisher.read", "publisher.edit"] as const),
  viewer: Object.freeze(["publisher.read"] as const),
}) satisfies Readonly<Record<PublisherRole, readonly PublisherCapability[]>>;

export function roleHasCapability(role: PublisherRole, capability: PublisherCapability): boolean {
  const capabilities: readonly PublisherCapability[] = PUBLISHER_CAPABILITY_MATRIX[role];
  return capabilities.includes(capability);
}
