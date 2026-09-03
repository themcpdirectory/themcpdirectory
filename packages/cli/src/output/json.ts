import type { JsonEnvelopeV1 } from "../commands/result.js";

export function serializeJsonEnvelope<T>(envelope: JsonEnvelopeV1<T>): string {
  return JSON.stringify(envelope);
}