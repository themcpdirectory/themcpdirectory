import { describe, expect, it } from "vitest";
import { getServerByIdentifier } from "../index.js";

type ScriptedRows = readonly unknown[][];

function createScriptedDb(rowsBySelect: ScriptedRows) {
  let selectIndex = 0;

  const buildChain = () => ({
    from: () => buildChain(),
    leftJoin: () => buildChain(),
    innerJoin: () => buildChain(),
    where: () => buildChain(),
    groupBy: () => buildChain(),
    orderBy: () => buildChain(),
    offset: () => buildChain(),
    limit: async () => rowsBySelect[selectIndex++] ?? [],
  });

  return {
    select: () => buildChain(),
    execute: async () => {
      throw new Error("execute should not be called");
    },
  };
}

describe("identifier resolution unit", () => {
  it("reports alias ambiguity as matchedBy alias", async () => {
    const db = createScriptedDb([
      [],
      [
        { id: "a", slug: "server-a", matchedAlias: "shared-alias" },
        { id: "b", slug: "server-b", matchedAlias: "shared-alias" },
      ],
    ]);

    await expect(getServerByIdentifier(db as never, "shared-alias")).rejects.toMatchObject({
      name: "AmbiguousServerIdentifierError",
      matchedBy: "alias",
    });
  });
});