const PORTABLE_HEADER_PLACEHOLDER_NAME_SOURCE = "[A-Za-z_][A-Za-z0-9_]*";

const PORTABLE_HEADER_PLACEHOLDER_NAME_PATTERN = new RegExp(
  `^${PORTABLE_HEADER_PLACEHOLDER_NAME_SOURCE}$`,
);
const SENSITIVE_HEADER_NAME_PATTERN =
  /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key)$/i;
const SENSITIVE_HEADER_HINT_PATTERN = /(token|key|secret|auth)/i;
const AUTHORIZATION_HEADER_NAME_PATTERN = /^(authorization|proxy-authorization)$/i;
const EXACT_HEADER_PLACEHOLDER_PATTERN = new RegExp(
  `^\\{(${PORTABLE_HEADER_PLACEHOLDER_NAME_SOURCE})\\}$`,
);
const SCHEMED_AUTH_PLACEHOLDER_PATTERN = new RegExp(
  `^(Bearer|Basic) \\{(${PORTABLE_HEADER_PLACEHOLDER_NAME_SOURCE})\\}$`,
  "i",
);

export interface ParsedRemoteHeaderTemplate {
  readonly placeholders: readonly string[];
  readonly hasMalformedPlaceholder: boolean;
}

export function isSensitiveRemoteHeaderName(name: string): boolean {
  return SENSITIVE_HEADER_NAME_PATTERN.test(name) || SENSITIVE_HEADER_HINT_PATTERN.test(name);
}

export function parseRemoteHeaderTemplate(template: string): ParsedRemoteHeaderTemplate {
  const placeholders: string[] = [];
  const seenPlaceholders = new Set<string>();
  let searchIndex = 0;

  while (searchIndex < template.length) {
    const nextOpenIndex = template.indexOf("{", searchIndex);
    const nextCloseIndex = template.indexOf("}", searchIndex);

    if (nextCloseIndex !== -1 && (nextOpenIndex === -1 || nextCloseIndex < nextOpenIndex)) {
      return { placeholders: [], hasMalformedPlaceholder: true };
    }

    if (nextOpenIndex === -1) {
      break;
    }

    const closeIndex = template.indexOf("}", nextOpenIndex + 1);
    if (closeIndex === -1) {
      return { placeholders: [], hasMalformedPlaceholder: true };
    }

    const placeholder = template.slice(nextOpenIndex + 1, closeIndex);
    if (!PORTABLE_HEADER_PLACEHOLDER_NAME_PATTERN.test(placeholder)) {
      return { placeholders: [], hasMalformedPlaceholder: true };
    }

    if (!seenPlaceholders.has(placeholder)) {
      seenPlaceholders.add(placeholder);
      placeholders.push(placeholder);
    }

    searchIndex = closeIndex + 1;
  }

  return { placeholders, hasMalformedPlaceholder: false };
}

export function isSafeSensitiveRemoteHeaderValue(name: string, value: string): boolean {
  if (parseRemoteHeaderTemplate(value).hasMalformedPlaceholder) {
    return false;
  }

  if (EXACT_HEADER_PLACEHOLDER_PATTERN.test(value)) {
    return true;
  }

  if (!AUTHORIZATION_HEADER_NAME_PATTERN.test(name)) {
    return false;
  }

  return SCHEMED_AUTH_PLACEHOLDER_PATTERN.test(value);
}
