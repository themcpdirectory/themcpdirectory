import {
  ChatBubbleIcon,
  CodeIcon,
  ComponentInstanceIcon,
  GlobeIcon,
  ImageIcon,
  LockClosedIcon,
  ReaderIcon,
} from "@radix-ui/react-icons";
import { Heading, Text } from "@radix-ui/themes";
import Link from "next/link";
import type { Route } from "next";

interface CategoryCardCategory {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly serverCount: number;
}

interface CategoryCardProps {
  readonly category: CategoryCardCategory;
}

const CATEGORY_ICONS = {
  ai: ReaderIcon,
  browser: GlobeIcon,
  communication: ChatBubbleIcon,
  code: CodeIcon,
  development: CodeIcon,
  images: ImageIcon,
  media: ImageIcon,
  security: LockClosedIcon,
} as const;

export function CategoryCard({ category }: CategoryCardProps) {
  const Icon =
    CATEGORY_ICONS[category.slug as keyof typeof CATEGORY_ICONS] ?? ComponentInstanceIcon;

  return (
    <Link href={`/categories/${category.slug}` as Route} className="entity-card">
      <span className="entity-card__icon" aria-hidden="true">
        <Icon />
      </span>
      <Heading as="h3" size="3" className="entity-card__title">
        {category.name}
      </Heading>
      {category.description ? (
        <Text as="p" size="2" className="entity-card__description">
          {category.description}
        </Text>
      ) : null}
      <span className="fact-badge fact-badge--technical">{category.serverCount} servers</span>
    </Link>
  );
}
