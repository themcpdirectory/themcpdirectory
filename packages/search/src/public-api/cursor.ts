import { createHmac, timingSafeEqual } from "node:crypto";
import { serverSortSchema, uuidSchema } from "@themcpdirectory/api-contract";
import type { ServerSearchCursorPayload } from "./types.js";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const FILTERS_HASH_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PAYLOAD_KEYS = [
  "filtersHash",
  "primary",
  "secondary",
  "serverId",
  "sort",
  "version",
] as const;

export class InvalidCursorError extends Error {
  constructor() {
    super("CURSOR_INVALID");
    this.name = "InvalidCursorError";
  }
}

function sign(secret: string, body: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

function isCursorValue(value: unknown): value is string | number | null {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function parsePayload(value: unknown): ServerSearchCursorPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidCursorError();
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== PAYLOAD_KEYS.length ||
    keys.some((key, index) => key !== PAYLOAD_KEYS[index])
  ) {
    throw new InvalidCursorError();
  }

  const sort = serverSortSchema.safeParse(record.sort);
  const serverId = uuidSchema.safeParse(record.serverId);
  if (
    record.version !== 1 ||
    !sort.success ||
    !serverId.success ||
    !isCursorValue(record.primary) ||
    !isCursorValue(record.secondary) ||
    typeof record.filtersHash !== "string" ||
    !FILTERS_HASH_PATTERN.test(record.filtersHash)
  ) {
    throw new InvalidCursorError();
  }

  return {
    version: 1,
    sort: sort.data,
    primary: record.primary,
    secondary: record.secondary,
    serverId: serverId.data,
    filtersHash: record.filtersHash,
  };
}

export function createServerSearchCursorCodec(secret: string) {
  if (Buffer.byteLength(secret) < 32) {
    throw new Error("Cursor signing secret must be at least 32 bytes");
  }

  return {
    encode(payload: ServerSearchCursorPayload): string {
      const validatedPayload = parsePayload(payload);
      const body = Buffer.from(JSON.stringify(validatedPayload)).toString("base64url");
      const signature = sign(secret, body).toString("base64url");
      return `${body}.${signature}`;
    },

    decode(cursor: string, expectedFiltersHash: string): ServerSearchCursorPayload {
      try {
        const segments = cursor.split(".");
        if (
          segments.length !== 2 ||
          cursor.length > 2048 ||
          !segments.every((segment) => BASE64URL_PATTERN.test(segment))
        ) {
          throw new InvalidCursorError();
        }

        const [body, signature] = segments as [string, string];
        const actualSignature = Buffer.from(signature, "base64url");
        const expectedSignature = sign(secret, body);
        if (
          actualSignature.toString("base64url") !== signature ||
          actualSignature.length !== expectedSignature.length ||
          !timingSafeEqual(actualSignature, expectedSignature)
        ) {
          throw new InvalidCursorError();
        }

        const payload = parsePayload(
          JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown,
        );
        if (payload.filtersHash !== expectedFiltersHash) {
          throw new InvalidCursorError();
        }

        return payload;
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          throw error;
        }
        throw new InvalidCursorError();
      }
    },
  };
}
