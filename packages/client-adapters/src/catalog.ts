import type { SupportedClientId } from "@themcpdirectory/api-contract";

export interface ClientCapabilities {
  readonly deeplink: boolean;
  readonly stdio: boolean;
  readonly streamableHttp: boolean;
  readonly headers: boolean;
  readonly environmentVariables: boolean;
  readonly remoteVariables: boolean;
}

export interface ClientDescriptor {
  readonly id: SupportedClientId;
  readonly name: string;
  readonly capabilities: ClientCapabilities;
}

export const SUPPORTED_CLIENTS = [
  {
    id: "claude-code",
    name: "Claude Code",
    capabilities: {
      deeplink: false,
      stdio: true,
      streamableHttp: true,
      headers: true,
      environmentVariables: true,
      remoteVariables: true,
    },
  },
  {
    id: "codex",
    name: "Codex",
    capabilities: {
      deeplink: false,
      stdio: true,
      streamableHttp: true,
      headers: true,
      environmentVariables: true,
      remoteVariables: true,
    },
  },
  {
    id: "cursor",
    name: "Cursor",
    capabilities: {
      deeplink: true,
      stdio: true,
      streamableHttp: true,
      headers: true,
      environmentVariables: true,
      remoteVariables: true,
    },
  },
] as const satisfies readonly ClientDescriptor[];

export function getSupportedClientById(id: string): ClientDescriptor | null {
  return SUPPORTED_CLIENTS.find((client) => client.id === id) ?? null;
}
