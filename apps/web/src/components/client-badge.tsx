import type { SupportedClientId } from "@themcpdirectory/api-contract";

const CLIENT_LABELS: Record<SupportedClientId, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  vscode: "VS Code",
};

interface ClientBadgeProps {
  readonly client: SupportedClientId;
}

export function ClientBadge({ client }: ClientBadgeProps) {
  return <span className="client-badge">{CLIENT_LABELS[client]}</span>;
}
