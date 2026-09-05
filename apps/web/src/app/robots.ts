import type { MetadataRoute } from "next";
import { PUBLIC_SITE_ROUTE_REFERENCE } from "@/content/site-route-reference";
import { buildCanonicalUrl } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  const privateRouteRoots = [
    ...new Set(
      PUBLIC_SITE_ROUTE_REFERENCE.filter(
        (route) => route.availability === "available" && route.auth === "authenticated",
      ).map((route) => `/${route.path.split("/")[1]}`),
    ),
  ];
  const privateRouteRules = privateRouteRoots.flatMap((path) => [`${path}$`, `${path}/`]);

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", ...privateRouteRules],
      },
    ],
    sitemap: buildCanonicalUrl("/sitemap.xml"),
  };
}
