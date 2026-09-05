import { describe, expect, it } from "vitest";
import { SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE } from "@themcpdirectory/test-utils";
import {
  AUTHENTICATED_LIGHTHOUSE_ROUTE_MATRIX,
  LIGHTHOUSE_DESKTOP_PROFILE,
  LIGHTHOUSE_MOBILE_PROFILE,
  NOINDEX_LIGHTHOUSE_ROUTES,
  PUBLIC_LIGHTHOUSE_ROUTE_MATRIX,
} from "../lighthouse-profiles.js";
import { medianScore } from "../run-lighthouse.js";

describe("lighthouse release harness", () => {
  it("selects the middle score from three runs and pins the release matrix", () => {
    expect(medianScore([0.97, 0.95, 0.98])).toBe(0.97);
    expect(PUBLIC_LIGHTHOUSE_ROUTE_MATRIX).toHaveLength(10);
    expect(AUTHENTICATED_LIGHTHOUSE_ROUTE_MATRIX).toEqual([
      "/dashboard",
      SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE,
    ]);
    expect([...NOINDEX_LIGHTHOUSE_ROUTES]).toEqual([
      "/search?q=github",
      "/dashboard",
      SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE,
    ]);
    expect([LIGHTHOUSE_MOBILE_PROFILE.formFactor, LIGHTHOUSE_DESKTOP_PROFILE.formFactor]).toEqual([
      "mobile",
      "desktop",
    ]);
  });
});