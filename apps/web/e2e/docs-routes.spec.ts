import { test, expect } from "@playwright/test";

test("docs landing lists the exact current and planned route facts", async ({ page }) => {
  await page.goto("/docs");

  const expectedRoutes = [
    {
      path: "/",
      title: "Home",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/search",
      title: "Search",
      access: "Access: available without signing in.",
      index: "Search indexing: excluded from the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/categories",
      title: "Categories",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/categories/[slug]",
      title: "Category detail",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/[slug]",
      title: "Server detail",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/docs",
      title: "Documentation",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/docs/api",
      title: "API docs",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/docs/cli",
      title: "CLI docs",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/docs/trust",
      title: "Trust and health docs",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/docs/publishers",
      title: "Publisher docs",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/sign-in",
      title: "Publisher sign-in",
      access: "Access: available without signing in.",
      index: "Search indexing: included in the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/dashboard",
      title: "Publisher dashboard",
      access: "Access: requires publisher authentication.",
      index: "Search indexing: excluded from the public index.",
      availability: "Availability: available now.",
    },
    {
      path: "/dashboard/listings/[id]",
      title: "Publisher listing detail",
      access: "Access: requires publisher authentication.",
      index: "Search indexing: excluded from the public index.",
      availability: "Availability: available now.",
    },
  ] as const;

  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Access boundary",
    ...expectedRoutes.map((route) => route.path),
  ]);

  for (const route of expectedRoutes) {
    const routeSection = page.getByRole("region", { name: route.path, exact: true });
    await expect(routeSection.locator("p")).toHaveText([
      `${route.title}. ${route.access}`,
      route.index,
      route.availability,
    ]);
  }

  await expect(page.getByText(/anonymous browsing remains available/i)).toBeVisible();
});
