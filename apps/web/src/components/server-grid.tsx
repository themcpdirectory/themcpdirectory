import { ServerCard, type ServerCardServer } from "@/components/server-card";

interface ServerGridProps {
  readonly servers: readonly ServerCardServer[];
  readonly emptyMessage: string;
}

export function ServerGrid({ servers, emptyMessage }: ServerGridProps) {
  if (servers.length === 0) {
    return <p className="directory-empty-state">{emptyMessage}</p>;
  }

  return (
    <ul className="server-grid">
      {servers.map((server) => (
        <li key={server.id}>
          <ServerCard server={server} />
        </li>
      ))}
    </ul>
  );
}
