import { BrandMark } from "@/components/brand-mark";
import { CommandBlock } from "@/components/command-block";
import { SearchForm } from "@/components/search-form";
import { PUBLIC_CLI_TARGETS } from "@/lib/public-cli-command";

interface HeroSearchProps {
  readonly command: string;
}

function formatTargetList(targets: readonly string[]): string {
  if (targets.length === 0) return "";
  if (targets.length === 1) return targets[0]!;
  return `${targets.slice(0, -1).join(", ")}, and ${targets[targets.length - 1]}`;
}

export function HeroSearch({ command }: HeroSearchProps) {
  return (
    <section aria-labelledby="home-heading" className="home-hero">
      <div className="page-container home-hero__layout">
        <div className="home-hero__content">
          <div className="home-hero__signature">
            <BrandMark kind="mark" aria-hidden="true" className="home-hero__mark" />
            <p className="home-hero__prompt">{"mcp>_"}</p>
          </div>

          <h1 id="home-heading" className="home-title">
            The MCP Directory
          </h1>
          <p className="home-tagline">Find it. Trust it. Install it.</p>
          <p className="home-hero__description">
            Discover MCP servers, inspect factual provenance, and install through a reviewed CLI
            flow.
          </p>

          <div className="home-hero__search">
            <SearchForm
              placeholder="Search by server, publisher, or task"
              submitLabel="Find servers"
              variant="hero"
              showShortcutHint
            />
          </div>

          <p className="home-hero__search-note">
            Press <kbd>/</kbd> to focus search.
          </p>
        </div>

        <div className="home-hero__aside">
          <CommandBlock
            label="Production install command"
            command={command}
            hint={`Supports ${formatTargetList(PUBLIC_CLI_TARGETS)}.`}
          />
        </div>
      </div>
    </section>
  );
}
