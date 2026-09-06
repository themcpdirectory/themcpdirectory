import Link from "next/link";
import type { Route } from "next";
import type { DirectoryServerListing } from "@themcpdirectory/domain";

// Structural subset shared by every public listing query (home, search, category).
export type DirectoryRowServer = Pick<
  DirectoryServerListing,
  "id" | "slug" | "title" | "shortDescription" | "isOfficialRegistry" | "publisherDisplayName"
>;

interface ServerDirectoryRowProps {
  readonly server: DirectoryRowServer;
}

export function ServerDirectoryRow({ server }: ServerDirectoryRowProps) {
  const href = `/${server.slug}` as Route;

  return (
    <article className="directory-row" aria-label={server.title} data-server-row={server.slug}>
      <div className="directory-row__identity">
        <Link href={href} className="directory-row__title">
          {server.title}
        </Link>
        {server.isOfficialRegistry && (
          <span className="directory-row__badge">Official Registry listing</span>
        )}
        {server.publisherDisplayName && (
          <span className="directory-row__publisher">{server.publisherDisplayName}</span>
        )}
      </div>
      <p className="directory-row__description">{server.shortDescription}</p>
      <Link href={href} className="directory-row__inspect" aria-label={`Inspect ${server.title}`}>
        Inspect
      </Link>
    </article>
  );
}
