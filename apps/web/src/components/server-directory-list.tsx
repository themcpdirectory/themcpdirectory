import { ServerGrid } from "@/components/server-grid";
import type { ServerCardServer } from "@/components/server-card";

interface ServerDirectoryListProps {
  readonly servers: readonly ServerCardServer[];
  readonly emptyMessage: string;
}

export function ServerDirectoryList({ servers, emptyMessage }: ServerDirectoryListProps) {
  return <ServerGrid servers={servers} emptyMessage={emptyMessage} />;
}
