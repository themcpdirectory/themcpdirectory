import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

const AES_KEY_LENGTH_BYTES = 32;
const GCM_IV_LENGTH_BYTES = 12;
const GCM_AUTH_TAG_LENGTH_BYTES = 16;
// Stable, unique HKDF context: domain-separates this key from any other subsystem
// (e.g. Better Auth's own session/cookie signing) deriving key material from the same secret.
const PKCE_KEY_DERIVATION_INFO = "themcpdirectory.publisher-claim-pkce-verifier.v1";

function deriveEncryptionKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(secret, "utf8"),
      Buffer.alloc(0),
      Buffer.from(PKCE_KEY_DERIVATION_INFO, "utf8"),
      AES_KEY_LENGTH_BYTES,
    ),
  );
}

// RFC 7636 S256: BASE64URL-ENCODE(SHA256(ASCII(value))). Reused for the callback
// state hash too, since both only need a deterministic, high-entropy digest.
export function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

// Server-only, BETTER_AUTH_SECRET-derived PKCE verifier encryption. The plaintext
// verifier must never be persisted or logged; only this ciphertext is stored.
export function encryptPkceVerifierCiphertext(plaintext: string, secret: string): string {
  const key = deriveEncryptionKey(secret);
  const iv = randomBytes(GCM_IV_LENGTH_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function decryptPkceVerifierCiphertext(ciphertext: string, secret: string): string {
  const key = deriveEncryptionKey(secret);
  const raw = Buffer.from(ciphertext, "base64url");
  const iv = raw.subarray(0, GCM_IV_LENGTH_BYTES);
  const authTag = raw.subarray(
    GCM_IV_LENGTH_BYTES,
    GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES,
  );
  const encrypted = raw.subarray(GCM_IV_LENGTH_BYTES + GCM_AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
