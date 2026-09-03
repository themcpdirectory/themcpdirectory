import type { JsonEnvelopeV1 } from "../commands/result.js";

export function serializeJsonEnvelope<T>(envelope: JsonEnvelopeV1<T>): string {
  return JSON.stringify(envelope).replace(
    /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu,
    (character) => `\\u${character.codePointAt(0)!.toString(16).padStart(4, "0")}`,
  );
}
