import { BookmarkIcon, ClockIcon, GlobeIcon, LayersIcon } from "@radix-ui/react-icons";
import type { CollectionSummary } from "@themcpdirectory/domain";
import { Heading, Text } from "@radix-ui/themes";
import Link from "next/link";
import type { Route } from "next";

interface CollectionCardProps {
  readonly collection: CollectionSummary;
}

function renderCollectionIcon(slug: string) {
  if (slug.includes("recent")) return <ClockIcon />;
  if (slug.includes("remote")) return <GlobeIcon />;
  if (slug.includes("official")) return <BookmarkIcon />;
  return <LayersIcon />;
}

export function CollectionCard({ collection }: CollectionCardProps) {
  return (
    <Link href={`/collections/${collection.slug}` as Route} className="entity-card">
      <span className="entity-card__icon" aria-hidden="true">
        {renderCollectionIcon(collection.slug)}
      </span>
      <Heading as="h3" size="3" className="entity-card__title">
        {collection.name}
      </Heading>
      <Text as="p" size="2" className="entity-card__description">
        {collection.description}
      </Text>
      <span className="fact-badge fact-badge--technical">{collection.serverCount} servers</span>
    </Link>
  );
}
