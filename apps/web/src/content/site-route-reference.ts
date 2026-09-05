interface PublicSiteRouteReference {
  readonly path: string;
  readonly title: string;
  readonly auth: "anonymous" | "authenticated";
  readonly index: boolean;
  readonly availability: "available" | "planned";
}

export const PUBLIC_SITE_ROUTE_REFERENCE: readonly PublicSiteRouteReference[] = [
  { path: "/", title: "Home", auth: "anonymous", index: true, availability: "available" },
  {
    path: "/search",
    title: "Search",
    auth: "anonymous",
    index: false,
    availability: "available",
  },
  {
    path: "/categories",
    title: "Categories",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/categories/[slug]",
    title: "Category detail",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/[slug]",
    title: "Server detail",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/docs",
    title: "Documentation",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/docs/api",
    title: "API docs",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/docs/cli",
    title: "CLI docs",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/docs/trust",
    title: "Trust and health docs",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/docs/publishers",
    title: "Publisher docs",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/sign-in",
    title: "Publisher sign-in",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/security",
    title: "Security policy",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/privacy",
    title: "Privacy notice",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/terms",
    title: "Terms of service",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/about",
    title: "About",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/open-source",
    title: "Open source status",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/publish",
    title: "Publish a server",
    auth: "anonymous",
    index: true,
    availability: "available",
  },
  {
    path: "/advertise",
    title: "Advertising status",
    auth: "anonymous",
    index: false,
    availability: "available",
  },
  {
    path: "/dashboard",
    title: "Publisher dashboard",
    auth: "authenticated",
    index: false,
    availability: "available",
  },
  {
    path: "/dashboard/listings/[id]",
    title: "Publisher listing detail",
    auth: "authenticated",
    index: false,
    availability: "available",
  },
];
