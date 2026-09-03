import type { ServerCollectionResponse, ServerDetailResponse } from "@themcpdirectory/api-contract";
import type { JsonEnvelopeV1 } from "../commands/result.js";

export function renderHumanEnvelope(envelope: JsonEnvelopeV1): readonly string[] {
  if (!envelope.ok || envelope.data === undefined) {
    return [];
  }

  switch (envelope.command) {
    case "search":
      return renderSearchEnvelope(envelope.data as ServerCollectionResponse);
    case "info":
      return renderInfoEnvelope(envelope.data as ServerDetailResponse);
    default:
      return [];
  }
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
    lines.push(`  Publisher: ${data.publisher.name}${data.publisher.verified ? " (verified)" : ""}`);
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