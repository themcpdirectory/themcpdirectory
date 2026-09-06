export const PUBLIC_CLI_PACKAGE_NAME = "@themcpdirectory/cli";
export const PUBLIC_CLI_TARGETS = Object.freeze([
  "Codex",
  "Claude Code",
  "Cursor",
  "VS Code",
] as const);

export function buildPublicAddCommand(slug: string): string {
  return `npx ${PUBLIC_CLI_PACKAGE_NAME} add ${slug}`;
}
