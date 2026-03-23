const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

const HTML_ENTITY_REGEX = /&(#x?[0-9a-f]+|[a-z]+);/gi;

function decodeHtmlEntity(entity: string): string {
  const normalized = entity.toLowerCase();

  if (normalized.startsWith("#x")) {
    const codePoint = Number.parseInt(normalized.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }

  if (normalized.startsWith("#")) {
    const codePoint = Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }

  return HTML_ENTITY_MAP[normalized] ?? `&${entity};`;
}

export function decodeHtml(value: string | null | undefined): string {
  if (!value || !value.includes("&")) {
    return value ?? "";
  }

  let current = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const decoded = current.replace(HTML_ENTITY_REGEX, (_match, entity: string) =>
      decodeHtmlEntity(entity),
    );

    if (decoded === current) {
      break;
    }

    current = decoded;
  }

  return current;
}
