import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("operator docs consistency", () => {
  it("preserves deployment and publication truth while linking the runbook", async () => {
    const [
      readme,
      development,
      deployment,
      runbook,
      blockers,
      compose,
      environmentSchema,
      ciWorkflow,
      publishWorkflow,
      cliPackageJson,
    ] = await Promise.all([
      readFile(new URL("../../../../README.md", import.meta.url), "utf8"),
      readFile(new URL("../../../../docs/development.md", import.meta.url), "utf8"),
      readFile(new URL("../../../../docs/deployment.md", import.meta.url), "utf8"),
      readFile(new URL("../../../../docs/release-runbook.md", import.meta.url), "utf8"),
      readFile(
        new URL("../../../../docs/production-authorisation-blockers.md", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../../../compose.portainer.yml", import.meta.url), "utf8"),
      readFile(new URL("../../../../packages/config/src/env.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../../.github/workflows/ci.yml", import.meta.url), "utf8"),
      readFile(
        new URL("../../../../.github/workflows/publish-container.yml", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../../../packages/cli/package.json", import.meta.url), "utf8"),
    ]);
    const cliPackage = JSON.parse(cliPackageJson) as {
      license?: string;
      private?: boolean;
    };

    expect(compose).toMatch(/^ {2}web:$/m);
    expect(compose).not.toMatch(/^ {2}api:$/m);
    for (const requiredWebVariable of [
      "BETTER_AUTH_SECRET",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_APP_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_APP_SLUG",
    ]) {
      expect(environmentSchema).toContain(`${requiredWebVariable}:`);
      expect(compose).not.toContain(requiredWebVariable);
    }
    expect(ciWorkflow).toContain("run: pnpm verify:release");
    expect(publishWorkflow).toContain("branches: [main]");
    expect(publishWorkflow).not.toContain("workflow_run");
    expect(cliPackage).toMatchObject({ license: "UNLICENSED", private: true });

    expect(readme).not.toContain("npm install -g @themcpdirectory/cli");
    expect(readme).toContain("No open-source license has been selected yet.");
    expect(readme).toContain("docs/release-runbook.md");
    expect(readme).toContain("pnpm verify:release does not publish to npm or deploy the stack.");
    expect(readme).toContain("**Production deployment is blocked.**");
    const readmeQuickStart = readme.slice(
      readme.indexOf("## Quick Start"),
      readme.indexOf("## Deployment"),
    );
    expect(readmeQuickStart).toContain(
      "The copied `.env.example` is sufficient for the anonymous web app and shared database commands, but not for `pnpm dev`.",
    );
    expect(readmeQuickStart).toContain("`API_CURSOR_SIGNING_SECRET`");
    expect(readmeQuickStart).toContain(
      "dedicated development GitHub OAuth and GitHub App credentials",
    );
    expect(readmeQuickStart).toContain("initial live Registry synchronization job");
    expect(development).toContain("pnpm verify:release");
    expect(development).toContain("docs/release-runbook.md");
    expect(development).toContain("The copied file does not by itself satisfy `pnpm dev`");
    expect(deployment).toContain("Portainer Business Edition");
    expect(deployment).toContain("GHCR");
    expect(deployment).toContain("Pull and redeploy");
    expect(deployment).toContain("backup");
    expect(deployment).toContain("rollback");
    expect(deployment).toContain("docs/release-runbook.md");
    expect(deployment).toContain("docs/production-authorisation-blockers.md");
    expect(deployment).toContain("**Current deployment status: Blocked.**");
    expect(deployment).toContain("Do not deploy this incomplete stack to production.");
    expect(deployment).not.toContain("The MVP can be deployed");
    expect(deployment).not.toContain("Deploy the stack.");
    const portainerVariablesStart = deployment.indexOf(
      "Add these environment variables in Portainer:",
    );
    const portainerVariablesEnd = deployment.indexOf(
      "The reviewed replacement stack must pass",
      portainerVariablesStart,
    );
    expect(portainerVariablesStart).toBeGreaterThanOrEqual(0);
    expect(portainerVariablesEnd).toBeGreaterThan(portainerVariablesStart);
    const portainerVariables = deployment.slice(portainerVariablesStart, portainerVariablesEnd);
    for (const requiredRuntimeVariable of [
      "NEXT_PUBLIC_BASE_URL",
      "API_BASE_URL",
      "API_CORS_ALLOWED_ORIGINS",
      "API_CURSOR_SIGNING_SECRET",
      "API_RATE_LIMIT_WINDOW_SECONDS",
      "API_RATE_LIMIT_MAX_READS",
      "BETTER_AUTH_SECRET",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "GITHUB_APP_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "GITHUB_APP_SLUG",
    ]) {
      expect(portainerVariables).toContain(`\`${requiredRuntimeVariable}\``);
    }
    const deploymentPreview = deployment.indexOf("access-restricted preview hostname");
    const deploymentSmoke = deployment.indexOf(
      "verify these routes through the access-restricted TLS endpoint",
      deploymentPreview,
    );
    const deploymentPublic = deployment.indexOf(
      "Enable unrestricted public routing only after smoke tests pass.",
      deploymentSmoke,
    );
    expect(deploymentPreview).toBeGreaterThanOrEqual(0);
    expect(deploymentSmoke).toBeGreaterThan(deploymentPreview);
    expect(deploymentPublic).toBeGreaterThan(deploymentSmoke);
    expect(runbook).toContain("## Version And Changelog");
    expect(runbook).toContain("## Migration And Service Order");
    expect(runbook).toContain("## Stop, Rollback, Or Forward-Fix");
    expect(runbook).toContain("## Known Limitations");
    const runbookPreview = runbook.indexOf("access-restricted preview hostname");
    const runbookSmoke = runbook.indexOf(
      "Run the applicable smoke tests through that restricted route.",
      runbookPreview,
    );
    const runbookPublic = runbook.indexOf(
      "Enable unrestricted public routing only after smoke tests pass.",
      runbookSmoke,
    );
    expect(runbookPreview).toBeGreaterThanOrEqual(0);
    expect(runbookSmoke).toBeGreaterThan(runbookPreview);
    expect(runbookPublic).toBeGreaterThan(runbookSmoke);
    expect(blockers).toContain("No approval is granted");
    expect(blockers).toContain("publish `@themcpdirectory/cli` to npm");
  });
});
