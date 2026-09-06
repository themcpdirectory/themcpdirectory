import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ServerDetailHeader, type ServerDetailHeaderProps } from "./server-detail-header";

describe("ServerDetailHeader", () => {
  it("shows the install total and only nonzero client counts", () => {
    const detail = {
      title: "GitHub MCP Server",
      listingStatus: "active",
      registrySourceKey: "official",
      currentUpstreamStatus: "active",
      shortDescription: "Connect agents to GitHub.",
      publisherDisplayName: "GitHub",
      publisherVerified: true,
    } satisfies ServerDetailHeaderProps["detail"];
    const installs = {
      total: 12,
      clients: { "claude-code": 0, codex: 0, cursor: 4, vscode: 8 },
    } satisfies ServerDetailHeaderProps["installs"];

    const markup = renderToStaticMarkup(
      <ServerDetailHeader detail={detail} installs={installs} publisherWebsiteUrl={null} />,
    );
    const text = markup
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    expect(text).toContain("12 CLI-reported installs");
    expect(text).toContain("Anonymous, abuse-limited reports; not verified unique installations.");
    expect(text).toContain("Cursor 4");
    expect(text).toContain("VS Code 8");
    expect(text).not.toContain("Claude Code");
    expect(text).not.toContain("Codex");
    expect(markup).toContain('<ul aria-label="CLI-reported installs by client">');
  });
});
