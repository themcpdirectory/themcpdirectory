export const PUBLIC_SITE_ROUTE_REFERENCE = [
  { path: "/", title: "Home", auth: "anonymous", index: true },
  { path: "/search", title: "Search", auth: "anonymous", index: false },
  { path: "/categories", title: "Categories", auth: "anonymous", index: true },
  {
    path: "/categories/[slug]",
    title: "Category detail",
    auth: "anonymous",
    index: true,
  },
  { path: "/[slug]", title: "Server detail", auth: "anonymous", index: true },
  { path: "/docs", title: "Documentation", auth: "anonymous", index: true },
  { path: "/docs/api", title: "API docs", auth: "anonymous", index: true },
  { path: "/sign-in", title: "Publisher sign-in", auth: "anonymous", index: false },
  { path: "/dashboard", title: "Publisher dashboard", auth: "authenticated", index: false },
  {
    path: "/dashboard/listings/[id]",
    title: "Publisher listing detail",
    auth: "authenticated",
    index: false,
  },
] as const;