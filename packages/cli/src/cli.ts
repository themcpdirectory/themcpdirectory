#!/usr/bin/env node

export const CLI_HELP_TEXT = [
  "Usage: mcpdir <command> [options]",
  "",
  "Commands:",
  "  help     Show this help",
  "",
  "Task 9 note: full command dispatch is implemented in later tasks.",
].join("\n");

export interface CliIo {
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
}

export async function runCli(
  argv: readonly string[],
  io: CliIo = { stdout: process.stdout, stderr: process.stderr },
): Promise<number> {
  const [command] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    io.stdout.write(`${CLI_HELP_TEXT}\n`);
    return 0;
  }

  io.stderr.write(`Unknown command: ${command}\n`);
  io.stderr.write("Run mcpdir --help for available commands.\n");
  return 1;
}

export async function runCliMain(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const exitCode = await runCli(argv);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
