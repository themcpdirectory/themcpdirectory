export interface JsonEnvelopeV1<T = unknown> {
  readonly schemaVersion: 1;
  readonly command: string;
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
  readonly warnings: readonly string[];
}

export interface CommandResult<T = unknown> {
  readonly exitCode: number;
  readonly stdout?: JsonEnvelopeV1<T>;
  readonly stderrLines: readonly string[];
  readonly warnings: readonly string[];
}

export function createSuccessResult<T>(
  command: string,
  data: T,
  warnings: readonly string[] = [],
): CommandResult<T> {
  const normalizedWarnings = Object.freeze([...warnings]);

  return {
    exitCode: 0,
    stdout: {
      schemaVersion: 1,
      command,
      ok: true,
      data,
      warnings: normalizedWarnings,
    },
    stderrLines: Object.freeze([]),
    warnings: normalizedWarnings,
  };
}

export function createFailureResult(
  command: string,
  options: {
    readonly exitCode: number;
    readonly code: string;
    readonly message: string;
    readonly stderrLines?: readonly string[];
    readonly warnings?: readonly string[];
  },
): CommandResult {
  const normalizedWarnings = Object.freeze([...(options.warnings ?? [])]);
  const normalizedStderrLines = Object.freeze([...(options.stderrLines ?? [options.message])]);

  return {
    exitCode: options.exitCode,
    stdout: {
      schemaVersion: 1,
      command,
      ok: false,
      error: {
        code: options.code,
        message: options.message,
      },
      warnings: normalizedWarnings,
    },
    stderrLines: normalizedStderrLines,
    warnings: normalizedWarnings,
  };
}