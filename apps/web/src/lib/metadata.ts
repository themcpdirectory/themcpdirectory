import type { Metadata } from "next";
import { getSiteOrigin } from "@/lib/site-url";

export function buildCanonicalUrl(path: string): string {
  return new URL(path, `${getSiteOrigin()}/`).toString();
}

export function buildDocumentMetadata(input: {
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly index: boolean;
}): Metadata {
  const canonical = buildCanonicalUrl(input.path);

  return {
    title: input.title,
    description: input.description,
    alternates: { canonical },
    robots: { index: input.index, follow: input.index },
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      siteName: "The MCP Directory",
      type: "website",
    },
  };
}
