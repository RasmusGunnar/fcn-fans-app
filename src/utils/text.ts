const MOJIBAKE_MARKER_REGEX =
  /(?:\u00C3[\u0080-\u00BF]?|\u00C2[\u0080-\u00BF]?|\u00E2[\u0080-\u00BF]{1,2}|\uFFFD)/gu;

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const HTML_ENTITY_REGEX = /&(#x?[0-9a-f]+|[a-z]+);/gi;

function countEncodingNoise(value: string): number {
  const markerCount = value.match(MOJIBAKE_MARKER_REGEX)?.length ?? 0;
  const replacementCount = value.match(/\uFFFD/g)?.length ?? 0;
  return markerCount * 10 + replacementCount * 25;
}

function repairEncodingOnce(value: string): string {
  try {
    return decodeURIComponent(escape(value));
  } catch {
    return value;
  }
}

function decodeHtmlEntity(entity: string): string {
  const normalized = entity.toLowerCase();

  if (normalized.startsWith('#x')) {
    const codePoint = Number.parseInt(normalized.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }

  if (normalized.startsWith('#')) {
    const codePoint = Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }

  return HTML_ENTITY_MAP[normalized] ?? `&${entity};`;
}

export function repairEncoding(input: string | null | undefined): string {
  if (typeof input !== 'string' || !input) {
    return '';
  }

  let current = input;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const decoded = repairEncodingOnce(current);
    if (countEncodingNoise(decoded) >= countEncodingNoise(current)) {
      break;
    }
    current = decoded;
  }

  return current;
}

export function decodeHtmlEntities(input: string | null | undefined): string {
  if (typeof input !== 'string' || !input) {
    return '';
  }

  let current = input;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const decoded = current.replace(HTML_ENTITY_REGEX, (_, entity: string) =>
      decodeHtmlEntity(entity),
    );

    if (decoded === current) {
      break;
    }

    current = decoded;
  }

  return current;
}

export function cleanText(input: string | null | undefined): string {
  if (input == null) {
    return '';
  }

  const repaired = repairEncoding(input);
  const decoded = decodeHtmlEntities(repaired);
  return repairEncoding(decoded);
}
