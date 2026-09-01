export interface SeedCategoryDefinition {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}

export const CURATED_CATEGORIES: readonly SeedCategoryDefinition[] = [
  {
    slug: "developer-tools",
    name: "Developer Tools",
    description: "CLI helpers, local utilities, and workflow tooling for developers.",
    sortOrder: 1,
  },
  {
    slug: "databases",
    name: "Databases",
    description: "Data access, querying, schema management, and database operations.",
    sortOrder: 2,
  },
  {
    slug: "browser-automation",
    name: "Browser Automation",
    description: "Browser control, scripted interaction, and UI automation workflows.",
    sortOrder: 3,
  },
  {
    slug: "search",
    name: "Search",
    description: "Indexing, retrieval, and search experience tooling.",
    sortOrder: 4,
  },
  {
    slug: "productivity",
    name: "Productivity",
    description: "Personal and team productivity helpers for daily development work.",
    sortOrder: 5,
  },
  {
    slug: "communication",
    name: "Communication",
    description: "Messaging, collaboration, and communication platform integrations.",
    sortOrder: 6,
  },
  {
    slug: "project-management",
    name: "Project Management",
    description: "Planning, issue tracking, and project coordination tools.",
    sortOrder: 7,
  },
  {
    slug: "cloud",
    name: "Cloud",
    description: "Cloud services, deployment, and hosted infrastructure.",
    sortOrder: 8,
  },
  {
    slug: "infrastructure",
    name: "Infrastructure",
    description: "Platform infrastructure, runtime operations, and environment setup.",
    sortOrder: 9,
  },
  {
    slug: "monitoring",
    name: "Monitoring",
    description: "Observability signals, health checks, and system monitoring.",
    sortOrder: 10,
  },
  {
    slug: "data-and-analytics",
    name: "Data and Analytics",
    description: "Data pipelines, analytics workflows, and reporting systems.",
    sortOrder: 11,
  },
  {
    slug: "ai-and-machine-learning",
    name: "AI and Machine Learning",
    description: "AI model workflows, evaluation, and machine learning tooling.",
    sortOrder: 12,
  },
  {
    slug: "files-and-storage",
    name: "Files and Storage",
    description: "File access, storage backends, and document management systems.",
    sortOrder: 13,
  },
  {
    slug: "commerce",
    name: "Commerce",
    description: "Payments, billing, and commerce-related tooling.",
    sortOrder: 14,
  },
  {
    slug: "security",
    name: "Security",
    description: "Authentication, authorization, secrets, and security operations.",
    sortOrder: 15,
  },
];
