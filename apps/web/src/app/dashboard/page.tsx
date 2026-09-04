import type { Metadata } from "next";
import { headers } from "next/headers";
import { getSessionOrNull } from "@themcpdirectory/auth";
import { getPublisherDashboard } from "@themcpdirectory/domain";
import { DashboardShell } from "@/components/publisher/dashboard-shell";
import { getDb } from "@/lib/db";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await getSessionOrNull(await headers());
  if (!session) {
    return null;
  }

  const params = await searchParams;
  const preferredPublisherId = typeof params.publisher === "string" ? params.publisher : null;

  const dashboard = await getPublisherDashboard(getDb(), {
    userId: session.user.id,
    preferredPublisherId,
  });

  return (
    <main id="main-content" tabIndex={-1} style={{ minHeight: "100vh" }}>
      <DashboardShell dashboard={dashboard} />
    </main>
  );
}
