interface SoftwareApplicationDetail {
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
}

interface BreadcrumbItem {
  readonly name: string;
  readonly path: string;
}

export function buildSoftwareApplicationJsonLd(detail: SoftwareApplicationDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: detail.title,
    description: detail.shortDescription,
    applicationCategory: "DeveloperApplication",
    url: detail.slug,
  } as const;
}

export function buildBreadcrumbJsonLd(input: readonly BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: input.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.path,
    })),
  } as const;
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
