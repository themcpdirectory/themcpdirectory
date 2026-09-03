import type { ServerCollectionResponse, ServerDetailResponse } from "@themcpdirectory/api-contract";
import type { AddExecutionResult } from "../commands/add-execute.js";
import type { ListCommandEntry } from "../commands/list.js";
import type {
  RemovalAmbiguityResult,
  RemovalNotInstalledResult,
  RemovalResult,
} from "../commands/remove.js";
import type { UpdateResult } from "../commands/update.js";
import type { JsonEnvelopeV1 } from "../commands/result.js";

export function renderHumanEnvelope(envelope: JsonEnvelopeV1): readonly string[] {
  if (envelope.data === undefined) {
    return [];
  }

  let lines: readonly string[];
  switch (envelope.command) {
    case "search":
      lines = renderSearchEnvelope(envelope.data as ServerCollectionResponse);
      break;
    case "info":
      lines = renderInfoEnvelope(envelope.data as ServerDetailResponse);
      break;
    case "add":
      lines = renderAddExecutionEnvelope(envelope.data as AddExecutionResult);
      break;
    case "list":
      lines = renderListEnvelope(envelope.data as readonly ListCommandEntry[]);
      break;
    case "remove":
      lines = renderRemoveEnvelope(
        envelope.data as RemovalResult | RemovalAmbiguityResult | RemovalNotInstalledResult,
      );
      break;
    case "update":
      lines = renderUpdateEnvelope(envelope.data as UpdateResult);
      break;
    default:
      return [];
  }

  return lines.map(sanitizeTerminalText);
}

export function sanitizeTerminalText(value: string): string {
  let sanitized = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const isControl =
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      codePoint === 0x061c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069);
    sanitized += isControl ? "?" : character;
  }
  return sanitized;
}

function renderUpdateEnvelope(result: UpdateResult): readonly string[] {
  return [
    ...result.updated.flatMap((target) => [
      `${target.client} (${target.scope}): ${target.status}`,
      `  Verification: ${target.verificationMessage}`,
      `  Recovery: ${target.recoveryHint}`,
    ]),
    ...result.skipped,
  ];
}

function renderListEnvelope(entries: readonly ListCommandEntry[]): readonly string[] {
  if (entries.length === 0) {
    return ["No installed MCP servers found."];
  }

  return entries.map(
    (entry) =>
      `${entry.name} (${entry.client}, ${entry.scope}) - ${entry.managedBy === "mcpdir" ? "Directory-managed" : "external"}`,
  );
}

function renderRemoveEnvelope(
  result: RemovalResult | RemovalAmbiguityResult | RemovalNotInstalledResult,
): readonly string[] {
  if (result.status === "ambiguous") {
    return [
      result.message,
      ...result.availableTargets.map(
        (target) => `  ${target.client} (${target.scope}) - ${target.managedBy}`,
      ),
    ];
  }

  if (result.status === "not_installed") {
    return [result.message];
  }

  return [
    `${result.slug} (${result.client}, ${result.scope}): ${result.status}`,
    `  ${result.executionMessage}`,
    `  Verification: ${result.verificationMessage}`,
    `  Recovery: ${result.recoveryHint}`,
  ];
}

function renderAddExecutionEnvelope(result: AddExecutionResult): readonly string[] {
  return result.targets.flatMap((target) => [
    `${target.client} (${target.scope}): ${target.status}`,
    `  Verification: ${target.verificationMessage}`,
    `  Recovery: ${target.recoveryHint}`,
  ]);
}

function renderSearchEnvelope(response: ServerCollectionResponse): readonly string[] {
  if (response.data.length === 0) {
    return [`No servers found.`, `Request ID: ${response.meta.requestId}`];
  }

  const lines: string[] = [];

  for (const server of response.data) {
    lines.push(`${server.title} (${server.slug})`);
    lines.push(`  ${server.description}`);

    if (server.publisher) {
      lines.push(
        `  Publisher: ${server.publisher.name}${server.publisher.verified ? " (verified)" : ""}`,
      );
    }

    if (server.version) {
      lines.push(`  Version: ${server.version}`);
    }
  }

  lines.push(`Request ID: ${response.meta.requestId}`);

  if (response.meta.nextCursor) {
    lines.push(`Next cursor: ${response.meta.nextCursor}`);
  }

  return lines;
}

function renderInfoEnvelope(response: ServerDetailResponse): readonly string[] {
  const { data } = response;
  const lines: string[] = [`${data.title} (${data.slug})`, `  ${data.shortDescription}`];

  if (data.publisher) {
    lines.push(
      `  Publisher: ${data.publisher.name}${data.publisher.verified ? " (verified)" : ""}`,
    );
  }

  if (data.version) {
    lines.push(`  Version: ${data.version}`);
  }

  if (data.categories.length > 0) {
    lines.push(
      `  Categories: ${data.categories.map((category: { readonly name: string }) => category.name).join(", ")}`,
    );
  }

  const compatibility = [
    ["claude-code", data.compatibility["claude-code"]],
    ["codex", data.compatibility.codex],
    ["cursor", data.compatibility.cursor],
    ["vscode", data.compatibility.vscode],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string");

  if (compatibility.length > 0) {
    lines.push(
      `  Compatibility: ${compatibility.map(([client, status]) => `${client}=${status}`).join(", ")}`,
    );
  }

  lines.push(`Request ID: ${response.meta.requestId}`);
  return lines;
}
