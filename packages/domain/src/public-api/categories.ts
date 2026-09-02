import type { PublicCategoryDetail, PublicCategorySummary } from "@themcpdirectory/api-contract";
import { categories, serverCategories, servers, type Database } from "@themcpdirectory/db";
import { searchServersPage, type SearchServersPageOptions } from "@themcpdirectory/search";
import { asc, eq, sql } from "drizzle-orm";

export async function listPublicCategories(
  db: Database,
): Promise<readonly PublicCategorySummary[]> {
  const rows = await db
    .select({
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
      serverCount: sql<number>`count(distinct ${servers.id})`,
    })
    .from(categories)
    .leftJoin(serverCategories, eq(serverCategories.categoryId, categories.id))
    .leftJoin(
      servers,
      sql`${servers.id} = ${serverCategories.serverId}
        and ${servers.moderationStatus} = 'normal'
        and ${servers.listingStatus} <> 'deleted_upstream'`,
    )
    .groupBy(categories.id)
    .orderBy(asc(categories.sortOrder), asc(categories.slug));

  return rows.map((row) => ({ ...row, serverCount: Number(row.serverCount) }));
}

export async function getPublicCategoryBySlug(
  db: Database,
  input: { slug: string; cursor?: string; limit?: number },
  options: SearchServersPageOptions,
): Promise<PublicCategoryDetail | null> {
  const normalizedSlug = input.slug.trim().toLowerCase();
  const [category] = await db
    .select({
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
    })
    .from(categories)
    .where(sql`lower(${categories.slug}) = ${normalizedSlug}`)
    .limit(1);
  if (!category) return null;

  const page = await searchServersPage(
    db,
    {
      category: category.slug,
      sort: "recent",
      limit: input.limit ?? 30,
      cursor: input.cursor,
    },
    options,
  );

  return { category, servers: [...page.items], nextCursor: page.nextCursor };
}
