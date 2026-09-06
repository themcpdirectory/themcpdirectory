import type { MetadataRoute } from "next";
import { getPublicSitemapEntries, getVisibleCollections } from "@themcpdirectory/domain";
import { buildIndexableSitemapPaths } from "@/content/site-route-reference";
import { getDb } from "@/lib/db";
import { buildCanonicalUrl } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb();
  const [{ serverSlugs, categorySlugs, publisherSlugs }, collections] = await Promise.all([
    getPublicSitemapEntries(db),
    getVisibleCollections(db),
  ]);
  const paths = buildIndexableSitemapPaths({
    serverSlugs,
    categorySlugs,
    publisherSlugs,
    collectionSlugs: collections.map((collection) => collection.slug),
  });

  return paths.map((path) => ({
    url: buildCanonicalUrl(path),
  }));
}
