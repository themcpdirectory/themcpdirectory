import type { ClientId } from "./types.js";

export type UnsupportedVariantReason =
  | "CLIENT_INCOMPATIBLE"
  | "MUTABLE_VERSION"
  | "UNSUPPORTED_REGISTRY"
  | "UNSUPPORTED_TRANSPORT"
  | "MALFORMED_INTEGRITY";

export class UnsupportedVariantError extends Error {
  readonly reason: UnsupportedVariantReason;
  readonly client: ClientId;
  readonly requestedVariantId?: string;
  readonly variantId?: string;

  constructor(
    reason: UnsupportedVariantReason,
    client: ClientId,
    message: string,
    options?: { readonly requestedVariantId?: string; readonly variantId?: string },
  ) {
    super(message);
    this.name = "UnsupportedVariantError";
    this.reason = reason;
    this.client = client;
    if (options?.requestedVariantId !== undefined) {
      this.requestedVariantId = options.requestedVariantId;
    }
    if (options?.variantId !== undefined) {
      this.variantId = options.variantId;
    }
  }
}
