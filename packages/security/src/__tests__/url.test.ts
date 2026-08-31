import { describe, expect, it } from "vitest";
import { validatePublicHttpUrl } from "../url.js";
import type { DnsResolver } from "../url.js";

const PUBLIC_DNS: DnsResolver = async () => ["93.184.216.34"];

const ALLOW = (u: string) =>
  expect(validatePublicHttpUrl(u, { resolve: PUBLIC_DNS })).resolves.toSatisfy(
    (r: { ok: true }) => r.ok,
  );
const DENY = (u: string, reason?: string) =>
  expect(validatePublicHttpUrl(u, { resolve: PUBLIC_DNS })).resolves.toSatisfy(
    (r: { ok: false; reason: string }) => {
      if (!r.ok && reason) expect(r.reason).toContain(reason);
      return !r.ok;
    },
  );

describe("validatePublicHttpUrl", () => {
  describe("accepts valid public URLs", () => {
    it.each([
      "https://example.com",
      "https://example.com/path?query=1#frag",
      "http://example.com:8080/api",
      "https://sub.domain.example.com/deep/path",
      "https://93.184.216.34/api",
    ])("accepts %s", (url) => ALLOW(url));
  });

  describe("rejects non-http(s) schemes", () => {
    it.each([
      "ftp://example.com",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:text/html,<h1>hi</h1>",
      "gopher://example.com",
      "",
      "not-a-url",
      "://missing-scheme",
    ])("rejects %s", (url) => DENY(url));
  });

  describe("rejects credentials in URL", () => {
    it.each(["https://user:pass@example.com", "https://user@example.com"])("rejects %s", (url) =>
      DENY(url, "credentials"),
    );
  });

  describe("rejects localhost and local suffixes", () => {
    it.each([
      "https://localhost",
      "https://localhost:8080/api",
      "https://LOCALHOST/path",
      "https://something.local",
      "https://my-service.local:3000",
      "https://host.localhost",
    ])("rejects %s", (url) => DENY(url));
  });

  describe("rejects loopback IPv4", () => {
    it.each(["https://127.0.0.1", "https://127.0.0.1:8080", "https://127.255.255.255"])(
      "rejects %s",
      (url) => DENY(url),
    );
  });

  describe("rejects private/reserved IPv4", () => {
    it.each([
      "https://10.0.0.1",
      "https://10.255.255.255",
      "https://172.16.0.1",
      "https://172.31.255.255",
      "https://192.168.0.1",
      "https://192.168.255.255",
      "https://169.254.1.1",
      "https://0.0.0.0",
      "https://255.255.255.255",
      "https://224.0.0.1",
      "https://239.255.255.255",
    ])("rejects %s", (url) => DENY(url));
  });

  describe("rejects IPv6 loopback and private", () => {
    it.each([
      "https://[::1]",
      "https://[::1]:8080",
      "https://[fc00::1]",
      "https://[fd00::1]",
      "https://[fe80::1]",
      "https://[::ffff:127.0.0.1]",
      "https://[::ffff:10.0.0.1]",
      "https://[::ffff:192.168.1.1]",
      "https://[::]",
    ])("rejects %s", (url) => DENY(url));
  });

  describe("rejects obfuscated IP forms", () => {
    it.each([
      "https://0x7f000001",
      "https://2130706433",
      "https://017700000001",
      "https://0177.0.0.1",
      "https://0x7f.0.0.1",
    ])("rejects %s", (url) => DENY(url));
  });

  describe("DNS resolution blocks private addresses", () => {
    const privateDns: DnsResolver = async () => ["127.0.0.1"];
    const publicDns: DnsResolver = async () => ["93.184.216.34"];
    const mixedDns: DnsResolver = async () => ["93.184.216.34", "10.0.0.1"];

    it("blocks hostname resolving to loopback", async () => {
      const result = await validatePublicHttpUrl("https://evil.example.com", {
        resolve: privateDns,
      });
      expect(result.ok).toBe(false);
    });

    it("allows hostname resolving to public IP", async () => {
      const result = await validatePublicHttpUrl("https://good.example.com", {
        resolve: publicDns,
      });
      expect(result.ok).toBe(true);
    });

    it("blocks hostname when any resolved address is private", async () => {
      const result = await validatePublicHttpUrl("https://mixed.example.com", {
        resolve: mixedDns,
      });
      expect(result.ok).toBe(false);
    });

    it("blocks when DNS resolution fails", async () => {
      const failDns: DnsResolver = async () => {
        throw new Error("ENOTFOUND");
      };
      const result = await validatePublicHttpUrl("https://nonexistent.example.com", {
        resolve: failDns,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("returns normalized URL", () => {
    it("normalizes URL on success", async () => {
      const noop: DnsResolver = async () => ["93.184.216.34"];
      const result = await validatePublicHttpUrl("HTTPS://EXAMPLE.COM/PATH", { resolve: noop });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.url).toBe("https://example.com/PATH");
      }
    });
  });
});
