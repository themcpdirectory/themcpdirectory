"use client";

import { useState } from "react";
import Link from "next/link";
import type { getServerDetailBySlug } from "@themcpdirectory/domain";

type PublicServerDetail = NonNullable<Awaited<ReturnType<typeof getServerDetailBySlug>>>;

export interface InstallCommandProps {
  readonly slug: string;
  readonly cliExecutableName: string;
  readonly installAvailability: PublicServerDetail["installAvailability"];
}

const UNAVAILABLE_COPY: Record<"install_unavailable" | "upstream_deleted", string> = {
  upstream_deleted: "Installation is blocked because this listing was removed upstream.",
  install_unavailable: "Installation details are currently unavailable.",
};

export function InstallCommand({
  slug,
  cliExecutableName,
  installAvailability,
}: InstallCommandProps) {
  const [status, setStatus] = useState("");
  const command = `${cliExecutableName} add ${slug}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setStatus("Command copied.");
    } catch {
      setStatus("Copy failed. Select the command text manually.");
    }
  }

  return (
    <section aria-labelledby="install-heading" className="install-command-section">
      <h2 id="install-heading">Installation</h2>
      {installAvailability === "available" ? (
        <div className="install-command">
          <p className="detail-empty-state">
            This assumes the {cliExecutableName} CLI is installed — see{" "}
            <Link href="/docs/cli">CLI setup and status</Link> for current details.
          </p>
          <div className="install-command__row">
            <code className="install-command__code">{command}</code>
            <button type="button" className="install-command__copy" onClick={handleCopy}>
              Copy install command
            </button>
          </div>
          <p className="install-command__status" role="status" aria-live="polite">
            {status}
          </p>
        </div>
      ) : (
        <p className="detail-empty-state">
          {UNAVAILABLE_COPY[installAvailability ?? "install_unavailable"]}
        </p>
      )}
    </section>
  );
}
