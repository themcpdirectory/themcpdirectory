const DEFAULT_SITE_URL = "https://themcpdirectory.org";

export function getSiteOrigin(): string {
  const url = new URL(process.env.NEXT_PUBLIC_BASE_URL ?? DEFAULT_SITE_URL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_BASE_URL must use http or https.");
  }
  return url.origin;
}
