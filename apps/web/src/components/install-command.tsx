"use client";

import Link from "next/link";
import type { getServerDetailBySlug } from "@themcpdirectory/domain";
import { CopyButton } from "@/components/copy-button";
import { buildPublicAddCommand, PUBLIC_CLI_PACKAGE_NAME } from "@/lib/public-cli-command";

type PublicServerDetail = NonNullable<Awaited<ReturnType<typeof getServerDetailBySlug>>>;

export interface InstallCommandProps {
  readonly slug: string;
  readonly installAvailability: PublicServerDetail["installAvailability"];
}

const UNAVAILABLE_COPY: Record<"install_unavailable" | "upstream_deleted", string> = {
  upstream_deleted: "Installation is blocked because this listing was removed upstream.",
  install_unavailable: "Installation details are currently unavailable.",
};

export function InstallCommand({ slug, installAvailability }: InstallCommandProps) {
  const command = buildPublicAddCommand(slug);

  return (
    <section aria-labelledby="install-heading" className="install-command-section">
      <h2 id="install-heading">Installation</h2>
      {installAvailability === "available" ? (
        <div className="install-command">
          <p className="detail-empty-state">
            This runs the {PUBLIC_CLI_PACKAGE_NAME} CLI with npx. See{" "}
            <Link href="/docs/cli">CLI setup and status</Link> for current details.
          </p>
          <div className="install-command__row">
            <code className="install-command__code">{command}</code>
            <CopyButton value={command} />
          </div>
        </div>
      ) : (
        <p className="detail-empty-state">
          {UNAVAILABLE_COPY[installAvailability ?? "install_unavailable"]}
        </p>
      )}
    </section>
  );
}
