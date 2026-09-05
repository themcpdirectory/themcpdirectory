import type { MetadataRoute } from "next";
import { getPublicSitemapEntries } from "@themcpdirectory/domain";
import { buildIndexableSitemapPaths } from "@/content/site-route-reference";
import { getDb } from "@/lib/db";
import { buildCanonicalUrl } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { serverSlugs, categorySlugs } = await getPublicSitemapEntries(getDb());
  const paths = buildIndexableSitemapPaths({ serverSlugs, categorySlugs });

  return paths.map((path) => ({
    url: buildCanonicalUrl(path),
  }));
}
