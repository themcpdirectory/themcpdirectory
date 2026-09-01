import { expect, test } from "@playwright/test";

test("database-backed public indexes render at request time", async () => {
  const routes = await Promise.all([
    import("../src/app/page"),
    import("../src/app/categories/page"),
    import("../src/app/sitemap"),
  ]);

  for (const route of routes) {
    expect((route as { dynamic?: string }).dynamic).toBe("force-dynamic");
  }
});
