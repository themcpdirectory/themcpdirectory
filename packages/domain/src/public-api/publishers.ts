import { httpUrlSchema, type PublicPublisherDetail } from "@themcpdirectory/api-contract";
import { publishers, type Database } from "@themcpdirectory/db";
import { searchServersPage, type SearchServersPageOptions } from "@themcpdirectory/search";
import { sql } from "drizzle-orm";

export async function getPublicPublisherBySlug(
  db: Database,
  input: { slug: string; cursor?: string; limit?: number },
  options: SearchServersPageOptions,
): Promise<PublicPublisherDetail | null> {
  const normalizedSlug = input.slug.trim().toLowerCase();
  const [row] = await db
    .select({
      slug: sql<string>`${publishers.slug}::text`,
      name: publishers.displayName,
      verified: sql<boolean>`coalesce(${publishers.verificationState} = 'verified', false)`,
      websiteUrl: publishers.websiteUrl,
    })
    .from(publishers)
    .where(sql`lower(${publishers.slug}::text) = ${normalizedSlug}`)
    .limit(1);
  if (!row) return null;

  const websiteUrl = httpUrlSchema.safeParse(row.websiteUrl);
  const publisher = {
    ...row,
    websiteUrl: websiteUrl.success ? websiteUrl.data : null,
  };
  const page = await searchServersPage(
    db,
    {
      publisher: publisher.slug,
      sort: "recent",
      limit: input.limit ?? 30,
      cursor: input.cursor,
    },
    options,
  );

  return { publisher, servers: [...page.items], nextCursor: page.nextCursor };
}
