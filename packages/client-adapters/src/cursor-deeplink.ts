import type { InstallPlan } from "@themcpdirectory/install-engine";
import { CursorJsonError, type CursorConfigDocument } from "./cursor-json.js";

interface CursorDeeplinkPayload {
  readonly serverSlug: string;
  readonly scope: InstallPlan["scope"];
  readonly server: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "cursor:" ||
    parsed.host !== "anysphere.cursor-deeplink" ||
    parsed.pathname !== "/mcp/install"
  ) {
    throw new CursorJsonError("CURSOR_INVALID_DOCUMENT", "Cursor deeplink operation URL is invalid");
  }

  const entries = Array.from(parsed.searchParams.entries());
  if (entries.length !== 1 || entries[0]?.[0] !== "payload") {
    throw new CursorJsonError(
      "CURSOR_INVALID_DOCUMENT",
      "Cursor deeplink operation must include exactly one payload parameter",
    );
  }

  return `${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
}

function getServerConfigFromDocument(plan: InstallPlan): unknown {
  const operation = plan.operations[0];
  if (!operation) {
    throw new CursorJsonError("CURSOR_INVALID_DOCUMENT", "Cursor plan contains no operations");
  }

  if (operation.type === "deeplink") {
    return normalizeUrl(operation.url);
  }

  if (operation.type !== "config-write") {
    throw new CursorJsonError(
      "CURSOR_INVALID_DOCUMENT",
      "Cursor deeplink requires a config-write or deeplink install operation",
    );
  }

  if (!isRecord(operation.document)) {
    throw new CursorJsonError(
      "CURSOR_INVALID_DOCUMENT",
      "Cursor config-write document must be a JSON object",
    );
  }

  const document = operation.document as CursorConfigDocument;
  if (
    document.mcpServers &&
    isRecord(document.mcpServers) &&
    Object.hasOwn(document.mcpServers, plan.serverSlug)
  ) {
    return document.mcpServers[plan.serverSlug];
  }

  return operation.document;
}

export function createCursorDeeplink(plan: InstallPlan): string {
  if (plan.client !== "cursor") {
    throw new CursorJsonError("CURSOR_INVALID_DOCUMENT", "Cursor deeplink requires a Cursor plan");
  }

  const maybeExistingDeeplink = getServerConfigFromDocument(plan);
  if (typeof maybeExistingDeeplink === "string") {
    return maybeExistingDeeplink;
  }

  const payload: CursorDeeplinkPayload = {
    serverSlug: plan.serverSlug,
    scope: plan.scope,
    server: maybeExistingDeeplink,
  };

  const payloadValue = encodeURIComponent(JSON.stringify(payload));
  return `cursor://anysphere.cursor-deeplink/mcp/install?payload=${payloadValue}`;
}
