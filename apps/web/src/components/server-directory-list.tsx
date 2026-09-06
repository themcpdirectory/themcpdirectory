import { ServerDirectoryRow, type DirectoryRowServer } from "@/components/server-directory-row";

interface ServerDirectoryListProps {
  readonly servers: readonly DirectoryRowServer[];
  readonly emptyMessage: string;
}

export function ServerDirectoryList({ servers, emptyMessage }: ServerDirectoryListProps) {
  if (servers.length === 0) {
    return <p className="directory-empty-state">{emptyMessage}</p>;
  }

  return (
    <ul className="directory-row-list">
      {servers.map((server) => (
        <li key={server.id}>
          <ServerDirectoryRow server={server} />
        </li>
      ))}
    </ul>
  );
}
