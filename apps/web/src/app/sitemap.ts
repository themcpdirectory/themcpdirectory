import type { MetadataRoute } from "next";
import { getPublicSitemapEntries } from "@themcpdirectory/domain";
import { getDb } from "@/lib/db";
import { getSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteOrigin();
  const { serverSlugs, categorySlugs } = await getPublicSitemapEntries(getDb());

  return [
    { url: baseUrl },
    { url: `${baseUrl}/categories` },
    ...categorySlugs.map((slug) => ({ url: `${baseUrl}/categories/${slug}` })),
    ...serverSlugs.map((slug) => ({ url: `${baseUrl}/${slug}` })),
  ];
}
