import { ArrowTopRightIcon, CheckCircledIcon, GlobeIcon } from "@radix-ui/react-icons";
import type { SupportedClientId } from "@themcpdirectory/api-contract";
import type { DiscoveryServer } from "@themcpdirectory/domain";
import { Flex, Heading, Text } from "@radix-ui/themes";
import Link from "next/link";
import type { Route } from "next";
import { ClientBadge } from "@/components/client-badge";

interface PublisherSummary {
  readonly slug?: string | null;
  readonly name: string;
  readonly verified?: boolean;
}

export interface ServerCardServer {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly shortDescription: string;
  readonly publisher?: DiscoveryServer["publisher"] | PublisherSummary | null;
  readonly publisherDisplayName?: string | null;
  readonly publisherSlug?: string | null;
  readonly officialRegistry?: boolean;
  readonly isOfficialRegistry?: boolean;
  readonly sourceAvailable?: boolean | null;
  readonly openSource?: boolean | null;
  readonly supportedClients?: readonly SupportedClientId[];
  readonly transports?: readonly string[];
}

interface ServerCardProps {
  readonly server: ServerCardServer;
}

function getPublisher(server: ServerCardServer) {
  if (server.publisher && "name" in server.publisher) {
    return {
      name: server.publisher.name,
      verified: Boolean(server.publisher.verified),
    };
  }

  if (server.publisherDisplayName) {
    return {
      name: server.publisherDisplayName,
      verified: false,
    };
  }

  return null;
}

function isOfficialRegistry(server: ServerCardServer) {
  return Boolean(server.officialRegistry ?? server.isOfficialRegistry);
}

function getSourceLabel(server: ServerCardServer) {
  if (server.openSource === true) return "Open source";
  if (server.sourceAvailable === true) return "Source available";
  return null;
}

export function ServerCard({ server }: ServerCardProps) {
  const href = `/${server.slug}` as Route;
  const publisher = getPublisher(server);
  const sourceLabel = getSourceLabel(server);

  return (
    <Link href={href} className="server-card">
      <Flex direction="column" gap="3">
        <Flex align="start" justify="between" gap="3">
          <div className="server-card__identity">
            <Heading as="h3" size="3" className="server-card__title">
              {server.title}
            </Heading>
            {publisher ? (
              <Text as="p" size="1" className="server-card__publisher">
                {publisher.name}
                {publisher.verified ? (
                  <span className="server-card__verified">
                    <CheckCircledIcon aria-hidden="true" />
                    Verified publisher
                  </span>
                ) : null}
              </Text>
            ) : null}
          </div>
          <ArrowTopRightIcon aria-hidden="true" className="server-card__icon" />
        </Flex>

        <Text as="p" size="2" className="server-card__description">
          {server.shortDescription}
        </Text>

        <div className="server-card__meta">
          {isOfficialRegistry(server) ? (
            <span className="fact-badge">Official Registry</span>
          ) : null}
          {sourceLabel ? (
            <span className="fact-badge fact-badge--positive">{sourceLabel}</span>
          ) : null}
          {server.supportedClients?.map((client) => (
            <ClientBadge key={client} client={client} />
          ))}
          {server.transports?.map((transport) => (
            <span key={transport} className="fact-badge fact-badge--technical">
              <GlobeIcon aria-hidden="true" />
              {transport}
            </span>
          ))}
        </div>
      </Flex>
    </Link>
  );
}
