import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/command-block", () => ({
  CommandBlock: () => <div>Install command</div>,
}));

vi.mock("@/components/search-box", () => ({
  SearchBox: () => <form role="search" />,
}));

import { HeroSearch } from "./hero-search";

describe("HeroSearch", () => {
  it("renders the approved logo asset instead of a text-built mark", () => {
    const markup = renderToStaticMarkup(<HeroSearch command="npx @themcpdirectory/cli" />);

    expect(markup).toContain('src="/standard-logo-transparent-black.svg"');
    expect(markup).toContain('src="/standard-logo-transparent-color.svg"');
    expect(markup).toContain('alt=""');
    expect(markup).not.toContain("mcp&gt;_");
  });
});
