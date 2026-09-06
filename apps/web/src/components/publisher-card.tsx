import { CheckCircledIcon, GlobeIcon } from "@radix-ui/react-icons";
import { Heading, Text } from "@radix-ui/themes";
import type { PublicPublisherDirectoryEntry } from "@themcpdirectory/domain";
import Link from "next/link";
import type { Route } from "next";

interface PublisherCardProps {
  readonly publisher: PublicPublisherDirectoryEntry;
}

function getWebsiteLabel(websiteUrl: string | null): string | null {
  if (!websiteUrl) return null;

  try {
    return new URL(websiteUrl).host;
  } catch {
    return null;
  }
}

export function PublisherCard({ publisher }: PublisherCardProps) {
  const websiteLabel = getWebsiteLabel(publisher.websiteUrl);

  return (
    <Link href={`/publishers/${publisher.slug}` as Route} className="entity-card">
      <span className="entity-card__icon" aria-hidden="true">
        <GlobeIcon />
      </span>
      <Heading as="h3" size="3" className="entity-card__title">
        {publisher.name}
      </Heading>
      {websiteLabel ? (
        <Text as="p" size="2" className="entity-card__description">
          {websiteLabel}
        </Text>
      ) : null}
      <div className="entity-card__meta">
        <span className="fact-badge fact-badge--positive">
          <CheckCircledIcon aria-hidden="true" />
          Verified publisher
        </span>
        <span className="fact-badge fact-badge--technical">{publisher.serverCount} servers</span>
      </div>
    </Link>
  );
}
