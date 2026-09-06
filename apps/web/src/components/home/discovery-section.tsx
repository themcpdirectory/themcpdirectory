import type { ReactNode } from "react";

interface DiscoverySectionProps<T extends { readonly slug: string }> {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly items: readonly T[];
  readonly renderItem: (item: T) => ReactNode;
}

export function DiscoverySection<T extends { readonly slug: string }>({
  title,
  description,
  action,
  items,
  renderItem,
}: DiscoverySectionProps<T>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="home-section">
      <div className="home-section__header">
        <div className="home-section__copy">
          <h2 className="home-section__title">{title}</h2>
          {description ? <p className="home-section__description">{description}</p> : null}
        </div>
        {action ? <div className="home-section__action">{action}</div> : null}
      </div>

      <ul className="server-grid" aria-label={title}>
        {items.map((item) => (
          <li key={item.slug}>{renderItem(item)}</li>
        ))}
      </ul>
    </section>
  );
}
