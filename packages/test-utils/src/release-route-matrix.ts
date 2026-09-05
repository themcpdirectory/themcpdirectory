export const SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE =
  "/dashboard/listings/11111111-1111-4111-8111-111111111111" as const;

export const PUBLIC_RELEASE_ROUTE_MATRIX = [
  "/",
  "/search?q=github",
  "/github",
  "/docs",
  "/docs/api",
  "/docs/cli",
  "/docs/trust",
  "/docs/publishers",
  "/security",
  "/sign-in",
  "/privacy",
  "/terms",
  "/about",
  "/open-source",
  "/publish",
] as const;

export const AUTHENTICATED_FIXTURE_ROUTE_MATRIX = [
  "/dashboard",
  SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE,
] as const;