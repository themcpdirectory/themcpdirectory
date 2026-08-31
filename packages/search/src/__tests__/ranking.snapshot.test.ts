import { describe, expect, it } from "vitest";
import { SEARCH_RANKING_WEIGHTS } from "../index.js";

describe("search ranking weights", () => {
  it("remains deterministic and explicit", () => {
    expect(SEARCH_RANKING_WEIGHTS).toMatchInlineSnapshot(`
      {
        "activeVisibleBoost": 4,
        "aliasExactBoost": 90,
        "exactSlugBoost": 120,
        "exactTitleBoost": 100,
        "ftsMultiplier": 40,
        "maintenanceBoost": 3,
        "maxMetadataCompletenessBoost": 6,
        "officialRegistryBoost": 5,
        "publisherVerifiedBoost": 4,
        "trigramMultiplier": 25,
      }
    `);
  });
});
