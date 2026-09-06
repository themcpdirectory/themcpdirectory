import type { EcosystemFacts as DiscoveryFacts } from "@themcpdirectory/domain";

interface EcosystemFactsProps {
  readonly facts: DiscoveryFacts;
}

export function EcosystemFacts({ facts }: EcosystemFactsProps) {
  const items = [
    {
      label: "Active servers",
      value: facts.activeServers.toLocaleString("en-US"),
    },
    {
      label: "Official Registry servers",
      value: facts.officialServers.toLocaleString("en-US"),
    },
    ...(facts.verifiedPublishers > 0
      ? [
          {
            label: "Verified publishers",
            value: facts.verifiedPublishers.toLocaleString("en-US"),
          },
        ]
      : []),
    {
      label: "CLI targets",
      value: facts.supportedClientTargets.toLocaleString("en-US"),
    },
  ] as const;

  return (
    <section aria-labelledby="directory-facts-heading" className="home-facts">
      <div className="page-container">
        <h2 id="directory-facts-heading" className="sr-only">
          Directory facts
        </h2>
        <dl className="home-facts__list">
          {items.map((item) => (
            <div key={item.label} className="home-facts__item">
              <dt className="home-facts__term">{item.label}</dt>
              <dd className="home-facts__value">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
