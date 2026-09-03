const ENV_REFERENCE_PATTERN = /\$\{?[A-Z][A-Z0-9_]{1,}\}?/;
const SECRET_MARKER_PATTERN =
  /(?:^|[^a-z])(secret|token|password|passphrase|api[_-]?key|access[_-]?key|bearer)(?:[^a-z]|$)/i;

export function looksSensitiveValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return ENV_REFERENCE_PATTERN.test(trimmed) || SECRET_MARKER_PATTERN.test(trimmed);
}

export function assertNoSensitiveValue(value: string, fieldName: string): void {
  if (looksSensitiveValue(value)) {
    throw new Error(`${fieldName} must not contain secret-looking material`);
  }
}
