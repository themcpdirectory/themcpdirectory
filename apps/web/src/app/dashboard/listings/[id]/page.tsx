import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionOrNull } from "@themcpdirectory/auth";
import { publisherClaims, publisherMemberships, servers } from "@themcpdirectory/db";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "Listing claim status",
  robots: { index: false, follow: false },
};

export default async function DashboardListingPage({
  params,
}: PageProps<"/dashboard/listings/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    notFound();
  }

  const session = await getSessionOrNull(await headers());
  if (!session) {
    notFound();
  }

  const [server] = await getDb()
    .select({ id: servers.id, title: servers.title, claimStatus: publisherClaims.status })
    .from(servers)
    .innerJoin(publisherClaims, eq(publisherClaims.serverId, servers.id))
    .innerJoin(
      publisherMemberships,
      eq(publisherMemberships.publisherId, publisherClaims.publisherId),
    )
    .where(and(eq(servers.id, id), eq(publisherMemberships.userId, session.user.id)))
    .orderBy(desc(publisherClaims.createdAt), desc(publisherClaims.id))
    .limit(1);

  if (!server) {
    notFound();
  }

  return (
    <main id="main-content" tabIndex={-1} style={{ minHeight: "100vh", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: "40rem", margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 0.75rem", fontSize: "1.5rem", fontWeight: 700 }}>
          {server.title}
        </h1>
        <p style={{ color: "var(--fg-muted)" }}>
          Claim status: <strong style={{ color: "var(--fg)" }}>{server.claimStatus}</strong>
        </p>
        <Link href="/dashboard" style={{ color: "var(--accent)" }}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
