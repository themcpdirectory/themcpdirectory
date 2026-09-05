import type { SupportedClientId } from "@themcpdirectory/api-contract";
import type { ClientScope } from "@themcpdirectory/install-engine";

export type ClientScopeSupport =
  | { readonly mode: "static"; readonly scopes: readonly ClientScope[] }
  | { readonly mode: "runtime-probed" };

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
  readonly scopeSupport: ClientScopeSupport;
  readonly capabilities: ClientCapabilities;
}

export const SUPPORTED_CLIENTS = [
  {
    id: "claude-code",
    name: "Claude Code",
    scopeSupport: { mode: "runtime-probed" },
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
    scopeSupport: { mode: "static", scopes: ["user"] },
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
    scopeSupport: { mode: "static", scopes: ["user", "project"] },
    capabilities: {
      deeplink: true,
      stdio: true,
      streamableHttp: true,
      headers: true,
      environmentVariables: true,
      remoteVariables: true,
    },
  },
  {
    id: "vscode",
    name: "VS Code",
    scopeSupport: { mode: "static", scopes: ["user", "project"] },
    capabilities: {
      deeplink: false,
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

export function isSupportedClientId(id: string | undefined): id is SupportedClientId {
  return id !== undefined && getSupportedClientById(id) !== null;
}
